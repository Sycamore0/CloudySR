import { AvatarType, PlayerBasicInfo } from "../../resources/autogenerated/common.define";
import { BattleAvatar, BattleEquipment, BattleRelic } from "../../resources/autogenerated/common.gamecore";
import { Avatar } from "../../resources/autogenerated/cs.avatar";
import { LineupAvatar, LineupAvatarData, LineupInfo } from "../../resources/autogenerated/cs.lineup";
import { Client } from "../network/client";
import { Logger } from "../utils/log";

export class PlayerManager {
    static players: Map<number, Player> = new Map<number, Player>();
}

export class Player {
    public curLineupIndex: number = 0;

    constructor(readonly session: Client, public basicInfo: PlayerBasicInfo, public avatars: Avatar[], public lineups: Lineup[]) {
    }
}
export class Lineup {
    constructor(readonly player: Player, public name: string, public avatarList: number[], public leaderSlot: number, public index: number, public isVirtual: boolean) {
        if(avatarList.length > 4){
            Logger.error("Lineup can't have more than 4 avatars. Slicing");
            this.avatarList = this.avatarList.slice(0, 3);
        }
    }

    public toLineupInfo(): LineupInfo {
        let slot = 0;
        const lineupInfo = LineupInfo.create();
        lineupInfo.name = this.name;
        lineupInfo.avatarList = this.avatarList.map(avatarId => {
            const avatar = this.player.avatars.find(avatar => avatar.baseAvatarId === avatarId);
            const lineupAvatar = LineupAvatar.create();
            lineupAvatar.avatarType = AvatarType.AVATAR_FORMAL_TYPE;
            lineupAvatar.id = avatar!.baseAvatarId;
            lineupAvatar.hp = 10000;
            lineupAvatar.sp = 10000;
            lineupAvatar.satiety = 10;
            lineupAvatar.slot = slot++;
            return lineupAvatar;
        });
        lineupInfo.leaderSlot = this.leaderSlot;
        lineupInfo.index = this.index;
        lineupInfo.mp = 100;
        lineupInfo.isVirtual = this.isVirtual;
        return lineupInfo;
    }

    public toLineupAvatarData(): LineupAvatarData[]
    {
        return this.avatarList.map(avatarId => {
            return LineupAvatarData.create({
                avatarType: AvatarType.AVATAR_FORMAL_TYPE,
                hp: 1000,
                id: avatarId
            });
        });
    }

    public toBattleAvatar(): BattleAvatar[]{
        return this.avatarList.map(avatarId => {
            const normalAvatar = this.player.avatars.find(avatar => avatar.baseAvatarId === avatarId)!;
            return BattleAvatar.create({
                avatarType: AvatarType.AVATAR_FORMAL_TYPE,
                id: avatarId,
                level: normalAvatar.level,
                promotion: normalAvatar.promotion,
                rank: normalAvatar.rank,
                skilltreeList: [],
                hp: 10000,
                sp: 10000,
                index: this.index,
                equipmentList: [
                    BattleEquipment.create({
                        id: normalAvatar.equipmentUniqueId,
                        level: 1,
                        promotion: 1,
                        rank: 1
                    })
                ],
                relicList: normalAvatar.equipRelicList.map(relic => {
                    return BattleRelic.create({
                        uniqueId: relic.relicUniqueId,
                        level: 1,
                    })
                }),
            });
        });
    }
}