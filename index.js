const Eris = require("eris");
const fs = require("fs");
const path = require("path");

const {validate_message} = require("./validate.js");

const PARDON_DURATION = 1000 * 3600 * 24;
const MAX_WARNINGS = 4;

const NO_ACTION = 0;
const ACTION_BAN = 1;
const ACTION_KICK = 2;
const ACTION_ERROR = -1;

const DELETE_OK = 1;
const DELETE_ERROR = -1;
const NOTIFY_OK = 1;
const NOTIFY_ERROR = -1;

const USERS_FILE = path.join(__dirname, "users.json");
const GUILDS_FILE = path.join(__dirname, "guilds.json");

const bot = new Eris(require("./secret.json").token, {
    intents: [
        "guilds",
        "guildMessages",
    ]
});

let users = fs.existsSync(USERS_FILE) ? new Map(JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))) : [];
let guilds = fs.existsSync(GUILDS_FILE) ? new Map(JSON.parse(fs.readFileSync(GUILDS_FILE, "utf8"))) : [];

bot.on("ready", () => {
    console.log("Logged in!");
});

bot.on("messageCreate", async (msg) => {
    // Ignore messages outside of guilds
    let guild = msg.channel?.guild;
    if (!guild) return;

    // Ignore message by bots (TODO: integrated pluralkit)
    if (msg.author.bot) return;

    // Ignore messages by those who have the "manage message" permission
    // let member = guild.members.get(msg.author.id);
    // if (msg.channel.permissionsOf(member).has("manageMessages")) return;

    let [is_bad, reason] = await validate_message(msg.content);

    if (is_bad) {
        console.log(reason);
        let user;

        // Get user information
        if (users.has(msg.author.id)) {
            user = users.get(msg.author.id);
            if (Date.now() - user.last_warning >= PARDON_DURATION) {
                // Pardon the user
                user.warns = 1;
                user.last_warning = Date.now();
            } else {
                user.warns++;
                user.last_warning = Date.now();
            }
        } else {
            user = {
                warns: 1,
                last_warning: Date.now()
            };
            users.set(msg.author.id, user);
        }

        // Get guild settings
        let guild_settings;
        if (guilds.has(guild.id)) {
            guild_settings = guilds.get(guild.id);
        } else {
            guild_settings = {
                notify_channel: null,
                max_warnings: 4,
                action: ACTION_KICK,
            };
            guilds.set(guild.id, guild_settings);
        }

        // Delete the message
        let delete_status;
        let delete_error;
        try {
            await msg.delete("Phishing link found: " + reason);
            delete_status = DELETE_OK;
        } catch (e) {
            console.error(e);
            delete_status = DELETE_ERROR;
            delete_error = e;
        }

        let action_status = NO_ACTION;
        let action_error;
        if (user.warns >= guild_settings.max_warnings) {
            // Take action on user
            try {
                if (guild_settings.action == ACTION_BAN) {
                    await guild.banMember(msg.author.id, 1, reason);
                } else if (guild_settings.action == ACTION_KICK) {
                    await guild.kickMember(msg.author.id, reason);
                }
                action_status = guild_settings.action;
            } catch (e) {
                console.error(e);
                action_status = ACTION_ERROR;
                action_error = e;
            }
        }

        // Notify the author
        let notify_status;
        let notify_error;
        try {
            let dm = await msg.author.getDMChannel();
            await dm.createMessage(
                `Your message in *${guild.name}* was removed, as it contains a link associated with phishing!\n` +
                `If you think that this was a mistake, then please contact one of the moderators.\n\n` +
                `Message ID: \`${msg.id}\`\n` +
                `Author: \`${msg.author.id}\`\n` +
                `You have: \`${user.warns}/${guild_settings.max_warnings}\` warnings. These will be cleared in ${Math.round(PARDON_DURATION / 3600 / 1000)} hours.\n`
            );
            notify_status = NOTIFY_OK;
        } catch (e) {
            console.error(e);
            notify_status = NOTIFY_ERROR;
            notify_error = e;
        }

        if (guild_settings.notify_channel && guild.channels.has(guild_settings.notify_channel)) {
            let notify_channel = guild.channels.get(guild_settings.notify_channel);
            try {
                let message = `**Phishing link found for user:** \`${msg.author.username}#${msg.author.discriminator}\`\n`;
                message += `Message ID: \`${msg.id}\`\n`;
                message += `Author: \`${msg.author.username}#${msg.author.discriminator}\` (\`${msg.author.id}\`, \`${msg.author.nick ?? msg.author.username}\`)\n`;
                message += `Message time: \`${new Date(msg.createdAt).toISOString()}\` (\`${msg.createdAt}\`)\n`;
                message += `Reason: \`${reason}\`\n`;
                message += `Warnings: \`${user.warns}/${guild_settings.max_warnings}\`\n`;
                message += `Action(s) taken:\n`;

                message += `- delete message (${delete_status === DELETE_OK ? "OK" : "**ERROR**: " + delete_error.toString()})\n`;
                message += `- notify author (${notify_status === NOTIFY_OK ? "OK" : "**ERROR**: " + notify_error.toString()})\n`;

                if (action_status !== NO_ACTION) {
                    if (guild_settings.action === ACTION_BAN) {
                        message += `- ban user (${action_status === ACTION_BAN ? "OK" : "**ERROR**: " + action_error.toString()})\n`;
                    }
                    if (guild_settings.action === ACTION_KICK) {
                        message += `- kick user (${action_status === ACTION_KICK ? "OK" : "**ERROR**: " + action_error.toString()})\n`;
                    }
                }

                await notify_channel.createMessage({
                    content: message,
                    allowedMentions: {
                        everyone: false,
                        roles: false,
                        users: false,
                    },
                });
            } catch (e) {
                console.error(e);
            }
        }
    }
});

setInterval(() => {
    for (let [id, user_data] of users) {
        if (Date.now() - user_data > PARDON_DURATION) {
            users.remove(id);
        }
    }
}, 3600 * 1000);

bot.connect();

process.on("exit", () => {
    // No event loop allowed here, so we have to use the synchronous api

    fs.writeFileSync(USERS_FILE, JSON.stringify([...users]), "utf8");
    console.log("Saved users to file " + USERS_FILE);

    fs.writeFileSync(GUILDS_FILE, JSON.stringify([...guilds]), "utf8");
    console.log("Saved guilds to file " + GUILDS_FILE);
});

process.on("SIGINT", () => {
    console.log();
    process.exit(0);
});
