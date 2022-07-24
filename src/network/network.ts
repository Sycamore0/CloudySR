import Denque from "denque";
import { createSocket, RemoteInfo } from "dgram";
import { AuthHandler } from "../handlers/auth";
import { Logger } from "../utils/log";
import { MT19937_64 } from "../utils/mt";
import { ClientManager } from "./client";
import { Connect, Disconnect, Establish, HandshakePacket } from "./packet";
import { RouteManager } from "./route";

interface UdpData{
    data: Buffer,
    address: AddressInfo
}

export interface AddressInfo{
    address: string,
    port: number
}

export class NetworkManager{
    
    readonly socket;

    public recvQueue: Denque<UdpData> = new Denque<UdpData>();
    public readonly clientManager = new ClientManager(this);
    public readonly routeManager = new RouteManager();

    readonly sharedBuffer: Buffer;

    readonly random: MT19937_64 = new MT19937_64();

    constructor(){
        this.sharedBuffer = Buffer.alloc(0x20000);
        this.socket = createSocket('udp4');
        this.socket.on('message', this.onReceived.bind(this));
        this.socket.on('listening', () => {
            this.scheduleQueue();
            Logger.log("Network initialized.");
        });

        this.socket.bind(23301);
        this.registeringRoutes();
    }

    public registeringRoutes(){
        new AuthHandler(this.routeManager);
    }

    onReceived(message: Buffer, remoteInfo: RemoteInfo){
        this.recvQueue.push({
            data: message,
            address: {
                address: remoteInfo.address,
                port: remoteInfo.port
            }
        })
    }

    scheduleQueue(){
        while(this.recvQueue.length > 0){
            const { data, address } = this.recvQueue.shift()!;
            const handshake = HandshakePacket.decode(data);
            if(handshake instanceof Connect){
                Logger.log("wow mihoyo really copy and pasted genshin handshake into hsr ahaha!")
                Logger.log("Received connection from " + address.address + ":" + address.port);
                this.clientManager.add(address, 0x96969696, 0x42424242);
                this.send(new Establish(0x96969696, 0x42424242).encode(), address);
            }else{
                const client = this.clientManager.get(address);
                if(!client){
                    this.send(new Disconnect().encode(), address);
                }else{
                    const read = client.kcp.input(data);
                    if(read < 0){
                        Logger.log("Error reading from client " + address.address + ":" + address.port);
                        return;
                    }
                    for(const packet of client.recv())
                    {
                        this.routeManager.handle(client, packet);
                    }
                }
            }
        }
        setImmediate(this.scheduleQueue.bind(this));
    }

    send(data: Buffer, address: AddressInfo){
        this.socket.send(data, address.port, address.address);
    }
}