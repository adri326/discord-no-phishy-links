const Eris = require("eris");

const {validate_message} = require("./validate.js");

const bot = new Eris(require("./secret.json").token, {
    intents: [
        "guilds",
        "guildMessages",
    ]
});

bot.on("ready", () => {
    console.log("Logged in!");
});

bot.on("messageCreate", async (msg) => {
    let [is_bad, reason] = await validate_message(msg.content);

    if (reason) {
        console.log(reason);
        msg.delete("Phishing link found: " + reason);
        try {
            let dm = await msg.author.getDMChannel();
            dm.createMessage(
                `Your message in *${msg.channel?.guild?.name ?? "??"}* was removed, as it contains a link associated with phishing!\n` +
                `If you think that this was a mistake, then please contact one of the moderators.\n\n` +
                `Message ID: \`${msg.id}\`\n` +
                `Author: \`${msg.author.id}\`\n`
            );
        } catch (e) {
            console.error(e);
        }
    }
});

bot.connect();
