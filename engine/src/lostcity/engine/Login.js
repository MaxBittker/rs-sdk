import Isaac from '#jagex2/io/Isaac.js';
import Packet from '#jagex2/io/Packet.js';
import { CrcBuffer32 } from '#lostcity/cache/CrcTable.js';
import World from '#lostcity/engine/World.js';
import Player from '#lostcity/entity/Player.js';

class Login {
    readIn(socket, data) {
        let opcode = data.g1();

        if (opcode === 16 || opcode === 18) {
            let login = data.gPacket(data.g1());

            let revision = login.g1();
            if (revision !== 225) {
                socket.send(Uint8Array.from([6]));
                socket.kill();
                return;
            }

            let info = login.g1();

            let crcs = login.gdata(9 * 4);
            if (Packet.crc32(crcs) !== CrcBuffer32) {
                socket.send(Uint8Array.from([6]));
                socket.kill();
                return;
            }

            login.rsadec();
            let magic = login.g1();
            if (magic !== 10) {
                socket.send(Uint8Array.from([11]));
                socket.kill();
                return;
            }

            let seed = [];
            for (let i = 0; i < 4; i++) {
                seed.push(login.g4());
            }

            let uid = login.g4();
            let username = login.gjstr();
            if (username.length < 1 || username.length > 12) {
                socket.send(Uint8Array.from([3]));
                socket.kill();
                return;
            }

            let password = login.gjstr();
            if (password.length < 4 || password.length > 20) {
                socket.send(Uint8Array.from([3]));
                socket.kill();
                return;
            }

            if (World.getPlayerByUsername(username)) {
                socket.send(Uint8Array.from([5]));
                socket.kill();
                return;
            }

            let player = Player.load(username);
            player.client = socket;
            player.lowMemory = (info & 0x1) === 1;
            player.webClient = socket.isWebSocket();
            socket.decryptor = new Isaac(seed);
            for (let i = 0; i < 4; i++) {
                seed[i] += 50;
            }
            socket.encryptor = new Isaac(seed);
            World.addPlayer(player);

            socket.state = 1;
            if (opcode === 18) {
                socket.send(Uint8Array.from([15]));
            } else {
                socket.send(Uint8Array.from([2]));
            }
        } else {
            socket.kill();
        }
    }
}

export default new Login();
