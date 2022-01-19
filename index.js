const Eris = require("eris");
const fs = require("fs");
const path = require("path");

const {validate_message} = require("./validate.js");

const PARDON_DURATION = 1000 * 3600 * 24;
const MAX_WARNINGS = 4;

const NO_ACTION = 0;
const ACTION_BAN = 1;
const ACTION_KICK = 2;
const ACTION_TIMEOUT = 4;
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

function get_guild_settings(guild) {
    if (guilds.has(guild.id)) {
        return guilds.get(guild.id);
    } else {
        let res = {
            notify_channel: null,
            max_warnings: 4,
            action: ACTION_KICK,
        };
        guilds.set(guild.id, res);
        return res;
    }
}


bot.on("ready", async () => {
    console.log("Logged in!");

    const COMMAND_OPTIONS = Eris.Constants.ApplicationCommandOptionTypes;

    await bot.createCommand({
        type: COMMAND_OPTIONS.CHAT_INPUT,
        name: "set-max-warnings",
        description: "Sets the max number of warnings that a user may get in a day for this server before action is taken",
        options: [
            {
                name: "amount",
                description: "The value to set max_warnings to",
                required: true,
                type: COMMAND_OPTIONS.STRING,
            }
        ]
    });

    await bot.createCommand({
        type: COMMAND_OPTIONS.CHAT_INPUT,
        name: "set-action",
        description: "Sets the action to take if a user sends a phishing link while having no warning left",
        options: [
            {
                name: "action-type",
                description: "Choose one of the following actions",
                required: true,
                type: COMMAND_OPTIONS.STRING,
                choices: [
                    {name: "None", value: "none"},
                    // {name: "Timeout", value: "timeout"}, // Not supported in Eris it seems :(
                    {name: "Kick", value: "kick"},
                    {name: "Ban", value: "ban"},
                ]
            }
        ]
    });

    await bot.createCommand({
        type: COMMAND_OPTIONS.CHAT_INPUT,
        name: "set-notify-channel",
        description: "Sets the channel to send notifications of detected phishing links to",
        options: [
            {
                name: "channel",
                description: "Choose a channel",
                required: true,
                type: COMMAND_OPTIONS.CHANNEL
            }
        ]
    });

    await bot.createCommand({
        type: COMMAND_OPTIONS.CHAT_INPUT,
        name: "get-settings",
        description: "Gets the settings for this bot on this server",
    });
});

bot.on("messageCreate", async (msg) => {
    // Ignore messages outside of guilds
    let guild = msg.channel?.guild;
    if (!guild) return;

    // Ignore message by bots (TODO: integrated pluralkit)
    if (msg.author.bot) return;

    // Ignore messages by those who have the "manage message" permission
    let member = guild.members.get(msg.author.id);
    if (msg.channel.permissionsOf(member).has("manageMessages")) return;

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
        let guild_settings = get_guild_settings(guild);

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
                } else if (guild_settings.action == ACTION_TIMEOUT) {
                    throw new Error("Unimplemented");
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
                    if (guild_settings.action === ACTION_TIMEOUT) {
                        message += `- time user out (${action_status === ACTION_TIMEOUT ? "OK" : "**ERROR**: " + action_error.toString()})\n`;
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

bot.on("interactionCreate", (interaction) => {
    if (interaction instanceof Eris.CommandInteraction) {
        let guild = interaction.channel?.guild;
        let member = interaction.member;
        let guild_settings = guild ? get_guild_settings(guild) : null;
        try {
            switch (interaction.data.name) {
                case "set-max-warnings":
                case "set-action":
                case "set-notify-channel":
                    if (!guild || !member) return interaction.createMessage("**Error:** not in a server!");

                    if (!member.permissions.has("manageGuild")) {
                        return interaction.createMessage(`**Error:** you are missing the "Manage Server" permission!`);
                    }

                    if (interaction.data.name === "set-max-warnings") {
                        let value = interaction.data.options[0].value;

                        if (!Number.isInteger(+value)) {
                            return interaction.createMessage("**Error:** `value` was not set to a valid number!");
                        }

                        guild_settings.max_warnings = +value;

                        return interaction.createMessage("Max warnings is now set to " + guild_settings.max_warnings);
                    } else if (interaction.data.name === "set-action") {
                        let value = interaction.data.options[0].value;

                        if (value === "none") value = NO_ACTION;
                        else if (value === "ban") value = ACTION_BAN;
                        else if (value === "kick") value = ACTION_KICK;
                        else if (value === "timeout") value = ACTION_TIMEOUT;
                        else return interaction.createMessage(
                            "**Error:** `value` was not set to a valid action. Expected `none`, `ban` or `kick`, got `" + value + "`"
                        );

                        guild_settings.action = value;

                        let message = "Action to be taken after the warnings are exhausted is now: `";
                        if (guild_settings.action === NO_ACTION) message += "none";
                        if (guild_settings.action === ACTION_BAN) message += "ban";
                        if (guild_settings.action === ACTION_KICK) message += "kick";
                        if (guild_settings.action === ACTION_TIMEOUT) message += "timeout";
                        message += "`";

                        return interaction.createMessage(message);
                    } else if (interaction.data.name === "set-notify-channel") {
                        let value = interaction.data.options[0].value;

                        let channel = guild.channels.get(value);

                        guild_settings.notify_channel = value;

                        return interaction.createMessage("Notify channel has been set to `" + channel.name + "`");
                    }
                    break;
                case "get-settings":
                    if (!guild || !member) return interaction.createMessage("**Error:** not in a server!");

                    let message = "The settings for this server are:\n";

                    message += `Max warnings: \`${guild_settings.max_warnings}\`\n`;

                    message += `Action after warnings were exhausted: \``;
                    if (guild_settings.action === NO_ACTION) message += "none";
                    if (guild_settings.action === ACTION_BAN) message += "ban";
                    if (guild_settings.action === ACTION_KICK) message += "kick";
                    if (guild_settings.action === ACTION_TIMEOUT) message += "timeout";
                    message += `\`\n`;

                    message += `Notification channel: \`${guild.channels.get(guild_settings.notify_channel)?.name ?? "none"}\`\n`;

                    return interaction.createMessage(message);
            }
        } catch (e) {
            console.error(e);
            try {
                interaction.reply(e.toString());
            } catch (_) {}
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
