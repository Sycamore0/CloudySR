import { MessageType, PartialMessage } from "@protobuf-ts/runtime";
import { Kcp } from "kcp-ts";
import { PacketHead } from "../../resources/autogenerated/PacketHead";
import { PacketIds } from "../../resources/ids";
import { cloneBuffer, Crypto, xorBuffer } from "../utils/crypto";
import { Logger } from "../utils/log";
import { AddressInfo, NetworkManager } from "./network";
import { DataPacket } from "./packet";

export class Client {

    readonly kcp: Kcp;

    public key: Buffer | undefined;

    constructor(readonly clientManager: ClientManager, readonly address: AddressInfo, readonly conv: number, readonly token: number) {
        this.kcp = new Kcp(conv, token, (buffer) => {
            buffer = cloneBuffer(buffer);
            clientManager.networkManager.send(buffer, address);
        });
        this.kcp.setNodelay(true, 2, true);
        this.kcp.setInterval(10);
        this.kcp.setWndSize(1024, 1024);
    }

    public recv(): DataPacket[] {
        this.kcp.update(Date.now());
        this.kcp.flush();
        const packets = [];
        for (; ;) {
            const buffer = this.clientManager.networkManager.sharedBuffer;
            const read = this.kcp.recv(buffer);
            if (read === -1 || read === -2) {
                break;
            }

            if (read === -3) {
                Logger.error("Buffer is too small");
                break;
            }
            const decrypted = cloneBuffer(buffer.slice(0, read));
            xorBuffer(this.getKey(), decrypted);
            const packet = DataPacket.decode(decrypted);
            if (packet) {
                Logger.log("Received packet with ID: " + packet?.id + " | Data " + packet.data.toString('hex') + " | Raw buffer " + decrypted.toString('hex'));
                packets.push(packet);
            } else {
                continue;
            }
        }
        this.kcp.update(Date.now());
        return packets;
    }

    public generateKey(secretKey: bigint) {
        const mt = this.clientManager.networkManager.random;
        mt.seed(secretKey);
        mt.seed(mt.next());
        mt.next();

        this.key = Buffer.alloc(4096);
        for (let i = 0; i < 4096; i += 8) {
            this.key.writeBigUint64BE(mt.next(), i);
        }
    }

    public getKey(): Buffer {
        return this.key === undefined ? Crypto.ec2b.key : this.key;
    }

    public sendPacket<T extends object>(type: MessageType<T>, message: PartialMessage<T>) {
        const name = type.typeName as keyof typeof PacketIds; //hahahahahahahahahaahhahahahah WHAT DOES THIS MEAN
        const metadata = PacketHead.create({
            sentMs: BigInt(Date.now())
        });
        const buffer = type.toBinary(message as T);
        const id = PacketIds[name];
        this.sendRaw(new DataPacket(id, Buffer.from(buffer), Buffer.from(PacketHead.toBinary(metadata))));
    }

    public sendRaw(packet: DataPacket) {
        for (let i = 0; i < 50; i++) {
            let bruteforce = new DataPacket(i, packet.data, packet.metadata);
            Logger.log("Sending packet with ID: " + i);
            const buffer = bruteforce.encode();
            xorBuffer(this.getKey(), buffer);
            this.kcp.send(buffer);
            this.kcp.update(Date.now());
            this.kcp.flush();
        }
    }
}

export class ClientManager {
    public readonly clients = new Map<string, Client>();

    constructor(readonly networkManager: NetworkManager) { }

    public get(address: AddressInfo): Client | undefined {
        return this.clients.get(address.address + ":" + address.port);
    }

    public add(address: AddressInfo, conv: number, token: number) {
        this.clients.set(address.address + ":" + address.port, new Client(this, address, conv, token));
    }

    public remove(address: AddressInfo) {
        this.clients.delete(address.address + ":" + address.port);
    }
}