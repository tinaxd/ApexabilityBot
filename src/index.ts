require('dotenv').config();
import axios from 'axios';
import { Client, Guild, GuildChannel, GuildEmoji, GuildMember, Intents, Message, MessageReaction, PartialMessageReaction, PartialUser, Presence, Role, User } from 'discord.js';
import { WebAPI } from './web';

const SELF_CHAN = "self-apexability";
const REPORT_CHAN = "apexability-check";

const APEXGAME = 'Apex Legends';

const WEB_API = process.env.WEB_API;
if (WEB_API == null) {
    console.log("WEB_API is not set");
    process.exit(1);
}

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (DISCORD_TOKEN == null) {
    console.log("DISCORD_TOKEN is not set");
    process.exit(1);
}

type GuildID = string;
type ChannelID = string;
type MessageID = string;

class DiscordBot {
    private client: Client;
    private watches: Map<GuildID, {
        selfChan: ChannelID,
        reportChan: ChannelID
    }> = new Map();

    private msgToWatch: Map<MessageID, GuildID> = new Map();

    constructor() {
        this.client = new Client({
            intents: [
                Intents.FLAGS.GUILD_MEMBERS,
                Intents.FLAGS.GUILD_PRESENCES,
                Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
                Intents.FLAGS.GUILDS
            ]
        });

        this.client.once('ready', async () => {
            console.log('[Discord] ready');

            const guilds = await this.client.guilds.fetch();
            for (const [_, v] of guilds) {
                // console.log(k);
                // console.log(v);
                // register channels with 'apexability-check' and 'self-apexability'
                const guild = await v.fetch();
                const channels = await guild.channels.fetch();

                let selfChan: GuildChannel | null = null;
                let reportChan: GuildChannel | null = null;
                for (const [_, ch] of channels) {
                    if (ch.name === SELF_CHAN) {
                        selfChan = ch;
                    } else if (ch.name === REPORT_CHAN) {
                        reportChan = ch;
                    }
                };

                if (selfChan != null && reportChan != null) {
                    this.watches.set(guild.id, {
                        selfChan: selfChan.id,
                        reportChan: reportChan.id
                    });
                    // console.log('[Discord] watches:');
                    // console.log(this.watches);
                    const msgId = await this.sendApexabilityMsg(selfChan, guild);
                    if (msgId != null) {
                        this.msgToWatch.set(msgId, guild.id);
                    }
                }
            };
        });

        this.client.on('messageReactionAdd', async (reaction, user) => {
            await this.handleReaction(reaction, user, true);
        });
        this.client.on('messageReactionRemove', async (reaction, user) => {
            await this.handleReaction(reaction, user, false);
        })

        this.client.on('presenceUpdate', async (oldPresence, newPresence) => {
            if (oldPresence == null) return;
            await this.handlePresenceUpdate(oldPresence, newPresence);
        });
    }

    start(token: string) {
        this.client.login(token);
    }

    private static isApexStart(oldPresence: Presence, newPresence: Presence) {
        for (const act of oldPresence.activities) {
            if (act.type === 'PLAYING' && act.name === APEXGAME) {
                return false;
            }
        }

        for (const act of newPresence.activities) {
            if (act.type === 'PLAYING' && act.name === APEXGAME) {
                return true;
            }
        }
        return false;
    }

    private static isApexStop(oldPresence: Presence, newPresence: Presence) {
        let apexed = false;
        for (const act of oldPresence.activities) {
            if (act.type === 'PLAYING' && act.name === APEXGAME) {
                apexed = true;
                break;
            }
        }
        if (!apexed) return false;

        for (const act of newPresence.activities) {
            if (act.type === 'PLAYING' && act.name === APEXGAME) {
                return false;
            }
        }
        return true;
    }

    private async handlePresenceUpdate(oldPresence: Presence, newPresence: Presence) {
        const started = DiscordBot.isApexStart(oldPresence, newPresence);
        const stopped = DiscordBot.isApexStop(oldPresence, newPresence);
        if (!started && !stopped) {
            // not related to apex
            return;
        }

        const member = newPresence.member;
        if (member == null) return;
        const guild = newPresence.guild;
        if (guild == null) return;
        const reportChanId = this.watches.get(guild.id)?.reportChan;
        if (reportChanId == null) return;
        await this.reportApexStatus(reportChanId, started, guild, member.user);
    }

    private async handleReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
        isAdd: boolean) {
        if (user == this.client.user) {
            return;
        }

        const msg = await reaction.message.fetch();
        if (msg == null) return;
        if (!this.msgToWatch.has(msg.id)) return;

        const guild = await msg.guild?.fetch();
        if (guild == null) return;
        if (!this.watches.has(guild.id)) return;

        const reportChanId = this.watches.get(guild.id)?.reportChan;
        if (reportChanId == null) return;
        await this.reportApexStatus(reportChanId, isAdd, guild, await user.fetch());
    }

    private async reportApexStatus(reportChanId: ChannelID, isStart: boolean, guild: Guild, user: User) {
        const reportChan = await this.client.channels.fetch(reportChanId);
        if (reportChan == null) return;
        if (!reportChan.isText()) {
            console.log(`[Discord] report chan is not a text channel in ${guild.name}`);
            return;
        }

        try {
            const member = await guild.members.fetch(user.id);

            const tail = isStart ? "を始めました" : "をやめました";
            const content = `${member.displayName} が Apex Legends ${tail}`;

            await reportChan.send(content);
            await this.apexRoleChange(member, isStart, guild);
            await this.reportToOneApex(member.displayName, isStart, new Date());
        } catch (e) {
            console.log(e);
            console.log('[Discord] member not found');
        }
    }

    private async apexRoleChange(member: GuildMember, on: boolean, guild: Guild) {
        const roles = await guild.roles.fetch();
        let apexRole: Role | null = null;
        for (const [_, v] of roles) {
            if (v.name === 'APEXable') {
                apexRole = v;
                break;
            }
        }
        if (apexRole == null) {
            console.log(`no role named APEXable in ${guild.name}`);
            return;
        }

        if (on) {
            await member.roles.add(apexRole);
        } else {
            await member.roles.remove(apexRole);
        }
    }

    private async sendApexabilityMsg(ch: GuildChannel, guild: Guild): Promise<MessageID | null> {
        const content = 'Apex Legends を始めたらリアクションをつけてください。';

        // search for :apex: emoji
        let apexEmoji: GuildEmoji | null = null;
        const emojis = await guild.emojis.fetch();
        for (const [k, v] of emojis) {
            if (v.name === 'apex') {
                apexEmoji = v;
                break;
            }
        }
        if (apexEmoji == null) {
            console.log(`:apex: emoji not found in ${guild.name}`);
            return null;
        }

        if (ch.isText()) {
            const msg = await ch.send(content);
            await msg.react(apexEmoji);
            return msg.id;
        } else {
            console.log(`self-apexability channel is not a text channel in ${guild.name}!`);
            return null;
        }
    }

    private async reportToOneApex(inGameName: string, isStart: boolean, time: Date) {
        await axios.post(WEB_API as string, {
            "in_game_name": inGameName,
            "type": isStart ? "start" : "stop",
            "time": time.toISOString()
        });
    }
}

const disco = new DiscordBot();
disco.start(DISCORD_TOKEN);

// const web = new WebAPI();
// web.start();
