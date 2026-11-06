import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { areaForMapSquare, createMapSquareAreaLookup, loadMapLabels, parseMapLabels } from './map-areas';

const CONTENT_DIR = join(import.meta.dir, '..', 'server', 'content');

describe('parseMapLabels', () => {
    test('reads name, position and size, joining "/" line breaks', () => {
        expect(parseMapLabels("=White Knights'/Castle,2961,3345,0\n=Falador,2989,3355,1\nnot a label\n")).toEqual([
            { name: "White Knights' Castle", x: 2961, z: 3345, size: 0 },
            { name: 'Falador', x: 2989, z: 3355, size: 1 },
        ]);
    });
});

describe('areaForMapSquare', () => {
    const labels = loadMapLabels(CONTENT_DIR);
    const area = (x: number, z: number) => areaForMapSquare(labels, x, z);

    test('names squares after the world map labels in them', () => {
        expect(area(50, 50)).toBe('Lumbridge');
        // White Knights' Castle: was "Camelot area".
        expect(area(46, 52)).toBe('Falador');
        // Crandor: was "Rimmington" (#81).
        expect(area(44, 50)).toBe('Crandor');
        // Aggie's house: was "Edgeville area".
        expect(area(48, 50)).toBe('Draynor Village');
        expect(area(48, 49)).toBe("Wizards' Tower");
        expect(area(46, 50)).toBe('Rimmington');
        expect(area(43, 54)).toBe('Camelot Castle');
    });

    test('names underground squares after the surface above them', () => {
        // The Legends' Quest dungeon, 6400 tiles north of Kharazi Jungle.
        expect(area(43, 145)).toBe('Kharazi Jungle (underground)');
    });

    test('falls back to the square id far from every label', () => {
        expect(area(10, 10)).toBe('m10_10');
    });

    test('lookup accepts "m{X}_{Z}" keys', () => {
        const lookup = createMapSquareAreaLookup(CONTENT_DIR);
        expect(lookup('m46_52')).toBe('Falador');
        expect(lookup('not-a-square')).toBe('not-a-square');
    });
});
