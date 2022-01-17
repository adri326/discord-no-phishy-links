const Eris = require("eris");
const levenshtein = require("js-levenshtein");
const stop_phishing = require('stop-discord-phishing')

const allowed_domains = require("./allowed_domains.json");
const flairs = require("./flairs.json");

const bot = new Eris(require("./secret.json").token, {
    intents: [
        "guilds",
        "guildMessages",
    ]
});

bot.on("ready", () => {
    console.log("Logged in!");
});

function permutator(array) {
    let permutation = array.slice();
    let length = array.length;
    let result = [array.slice()];
    let count = new Array(length).fill(0);

    let i = 1;

    while (i < length) {
        if (count[i] < i) {
            let k = i % 2 && count[i];
            let tmp = permutation[i];
            permutation[i] = permutation[k];
            permutation[k] = tmp;
            count[i]++;
            i = 1;
            result.push(permutation.slice());
        } else {
            count[i] = 0;
            i++;
        }
    }

    return result;
}

const cache = new Map();
function cached_permutator(array) {
    if (cache.has(array)) return cache.get(array);

    let result = permutator(array);

    cache.set(array, result);
    return result;
}

function check_domain(domain, flair) {
    let distance = flair.distance ?? 0;
    let parts = domain.split(".").reverse();

    function match(ngram) {
        if (typeof flair.domain === "string") {
            return levenshtein(ngram, flair.domain) <= distance;
        } else if (Array.isArray(flair.domain)) {
            for (let permutation of cached_permutator(flair.domain)) {
                if (levenshtein(ngram, permutation.join("")) <= distance) {
                    return true;
                }
            }
        }
    }

    // match each part of the domain name
    for (let part of parts) {
        if (match(part)) {
            return false;
        }
    }

    // match 2-grams and their permutations
    for (let n = 0; n < parts.length - 1; n++) {
        for (let permutation of permutator([parts[n], parts[n + 1]])) {
            if (match(permutation.join("."))) {
                return false;
            }
        }
    }
}

function check_flair(link, flair) {
    let distance = flair.distance ?? 0;
    if (flair.domain) {
        let domain = (link.split("/").filter(Boolean)[0] || "").toLowerCase();
        if (!allowed_domains.includes(domain) && !check_domain(domain, flair)) return false;
    }

    return true;
}

function validate(link) {
    for (let flair of flairs) {
        if (!check_flair(link, flair)) return false;
    }
    return true;
}

bot.on("messageCreate", async (msg) => {
    let regex = /\w+:\/\/(\S+)/g; // crude but will match a superset of that of the urls
    let match;
    let is_bad = false;
    let reason = null;
    while (match = regex.exec(msg.content)) {
        if (!validate(match[1])) {
            console.log("Levenhstein-based detection: " + msg.content);
            is_bad = true;
            reason = "Levenhstein(" + match[0] + ")";
        }
    }

    if (!is_bad && await stop_phishing.checkMessage(msg.content)) {
        console.log("stop-discord-phishing: " + msg.content);
        is_bad = true;
        reason = "stop-discord-phishing checkMessage";
    }

    if (is_bad) {
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
