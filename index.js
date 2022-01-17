const Eris = require("eris");
const fs = require("fs");
const path = require("path");

const {validate_message} = require("./validate.js");

const PARDON_DURATION = 1000 * 3600 * 24;
const MAX_WARNINGS = 4;
const USERS_FILE = path.join(__dirname, "users.json");

const bot = new Eris(require("./secret.json").token, {
    intents: [
        "guilds",
        "guildMessages",
    ]
});

let users = fs.existsSync(USERS_FILE) ? new Map(JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))) : [];

bot.on("ready", () => {
    console.log("Logged in!");
});

bot.on("messageCreate", async (msg) => {
    // Ignore messages outside of guilds
    let guild = msg.channel?.guild;
    if (!guild) return;

    // Ignore messages by those who have the "manage message" permission
    // let member = guild.members.get(msg.author.id);
    // if (msg.channel.permissionsOf(member).has("manageMessages")) return;

    let [is_bad, reason] = await validate_message(msg.content);

    if (is_bad) {
        console.log(reason);
        let user;

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

        if (user.warns >= MAX_WARNINGS) {
            // Take action on user
            guild.banMember(msg.author.id, 1, reason);
        }

        msg.delete("Phishing link found: " + reason);
        try {
            let dm = await msg.author.getDMChannel();
            dm.createMessage(
                `Your message in *${guild.name}* was removed, as it contains a link associated with phishing!\n` +
                `If you think that this was a mistake, then please contact one of the moderators.\n\n` +
                `Message ID: \`${msg.id}\`\n` +
                `Author: \`${msg.author.id}\`\n` +
                `You have: \`${user.warns}\` warnings. These will be cleared in ${Math.round(PARDON_DURATION / 3600 / 1000)} hours.\n`
            );
        } catch (e) {
            console.error(e);
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
});

process.on("SIGINT", () => {
    console.log();
    process.exit(0);
});
