import type IfType from '#/config/IfType.js';
import { ButtonType } from '#/config/IfType.js';
import ObjType from '#/config/ObjType.js';
import type { InterfaceComponentState, InterfaceModelState, InterfaceSnapshotState } from './types.js';

type ObjectDefinition = Pick<ObjType, 'model' | 'recol_s' | 'recol_d' | 'countobj' | 'countco'>;
type Rect = { x: number; y: number; width: number; height: number };
const MAX_COMPONENTS = 256;
const MAX_VISITS = 512;
const MAX_DEPTH = 16;
const MAX_TEXT = 1024;
const MAX_RECOLOURS = 64;

/** Synchronous and read-only: the caller must supply this bot's active interface table. */
export function collectInterfaceSnapshot(rootId: number, table: readonly IfType[], readObject: (id: number) => ObjectDefinition = id => ObjType.list(id)): InterfaceSnapshotState {
    const snapshot: InterfaceSnapshotState = { version: 1, rootId, components: [], truncated: false };
    if (rootId === -1) return snapshot;
    const root = table[rootId];
    if (!root || root.type !== 0 || root.width <= 0 || root.height <= 0) {
        snapshot.truncated = true;
        return snapshot;
    }
    const seen = new Set<number>();
    let visits = 0;
    const text = (value: string | null): string => {
        if ((value?.length ?? 0) > MAX_TEXT) snapshot.truncated = true;
        return (value ?? '').slice(0, MAX_TEXT);
    };
    const intersect = (a: Rect, b: Rect): Rect => {
        const x = Math.max(a.x, b.x),
            y = Math.max(a.y, b.y);
        return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y };
    };
    const model = (com: IfType, node: InterfaceComponentState): InterfaceModelState | null => {
        const kind = ({ 1: 'raw', 2: 'npc_head', 3: 'player_head', 4: 'object' } as const)[com.model1Type as 1 | 2 | 3 | 4];
        if (!kind) {
            if (com.model1Type !== 0) {
                node.contentResolved = false;
                node.unresolvedReason = 'unsupported_model_type';
            }
            return null;
        }
        const result: InterfaceModelState = {
            kind,
            sourceId: com.model1Id,
            objectId: null,
            definitionObjectId: null,
            meshId: kind === 'raw' ? com.model1Id : null,
            recolours: null,
            zoom: com.modelZoom,
            rotationX: com.modelXAn,
            rotationY: com.modelYAn,
            animationId: com.modelAnim
        };
        if (kind !== 'object') return result;
        result.objectId = com.model1Id;
        try {
            let definitionId = com.model1Id;
            let definition = readObject(definitionId);
            // IfType.getModel(type=4) renders ObjType.getModelUnlit(50).
            let variant = -1;
            if (definition.countobj && definition.countco) {
                for (let i = 0; i < 10; i++) {
                    if (definition.countco[i] !== 0 && 50 >= definition.countco[i]) variant = definition.countobj[i];
                }
            }
            if (variant !== -1) {
                definitionId = variant;
                definition = readObject(variant);
            }
            const sources = definition.recol_s,
                destinations = definition.recol_d;
            if ((sources?.length ?? 0) !== (destinations?.length ?? 0) || (sources?.length ?? 0) > MAX_RECOLOURS) throw new Error('Incomplete recolours');
            result.definitionObjectId = definitionId;
            result.meshId = definition.model;
            result.recolours = Array.from(sources ?? [], (source, i) => ({ source, destination: destinations![i] }));
        } catch {
            node.contentResolved = false;
            node.unresolvedReason = 'missing_object_definition';
        }
        return result;
    };
    const visit = (id: number, parentId: number | null, x: number, y: number, clip: Rect, depth: number, scrollY: number): void => {
        if (++visits > MAX_VISITS || snapshot.components.length >= MAX_COMPONENTS || depth > MAX_DEPTH || seen.has(id)) {
            snapshot.truncated = true;
            return;
        }
        seen.add(id);
        const com = table[id];
        if (!com) {
            snapshot.truncated = true;
            return;
        }
        if (com.type === 0 && com.hide) return;
        // Inventory grids have slot units, not pixel bounds; their contents already have dedicated SDK state.
        if (![0, 3, 4, 5, 6].includes(com.type)) {
            snapshot.truncated = true;
            return;
        }
        const bounds = { x, y, width: com.width, height: com.height };
        const visible = intersect(bounds, clip);
        if (visible.width <= 0 || visible.height <= 0) return;
        const node: InterfaceComponentState = { id, parentId, type: com.type, buttonType: com.buttonType, bounds, text: null, tooltip: text(com.buttonText), model: null, contentResolved: true };
        // Continue text can be replaced with 'Please wait...' by the client's pause state.
        if (com.clientCode > 0 || (com.type === 4 && com.buttonType === ButtonType.BUTTON_CONTINUE)) {
            node.contentResolved = false;
            node.unresolvedReason = 'client_generated';
        } else if (com.scriptComparator?.length) {
            node.contentResolved = false;
            node.unresolvedReason = 'conditional';
        } else if (com.type === 4 && /%[1-5]/.test(com.text ?? '')) {
            node.contentResolved = false;
            node.unresolvedReason = 'dynamic_text';
        }
        if (node.contentResolved) {
            if (com.type === 4) node.text = text(com.text);
            if (com.type === 6) node.model = model(com, node);
        }
        snapshot.components.push(node);
        if (com.type !== 0 || !com.children) return;
        for (let i = 0; i < com.children.length; i++) {
            if (visits >= MAX_VISITS || snapshot.components.length >= MAX_COMPONENTS) {
                snapshot.truncated = true;
                break;
            }
            const childId = com.children[i],
                child = table[childId];
            if (!child || com.childX?.[i] === undefined || com.childY?.[i] === undefined) {
                snapshot.truncated = true;
                visits++;
                continue;
            }
            const childScroll = Math.max(0, Math.min(child.scrollPos, child.scrollHeight - child.height));
            visit(childId, id, x + com.childX[i] + child.x, y + com.childY[i] + child.y - scrollY, visible, depth + 1, childScroll);
        }
    };
    visit(rootId, null, 0, 0, { x: 0, y: 0, width: root.width, height: root.height }, 0, 0);
    return snapshot;
}
