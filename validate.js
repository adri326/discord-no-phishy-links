const levenshtein = require("js-levenshtein");
const stop_phishing = require('stop-discord-phishing');

const allowed_domains = require("./allowed_domains.json").map(domain => domain.split(".").reverse());
const flairs = require("./flairs.json");

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

    return true;
}

function is_allowed_domain(domain) {
    let parts = domain.toLowerCase().split(".").reverse();

    for (let allowed_domain of allowed_domains) {
        let is_valid = true;
        for (let n = 0; n < allowed_domain.length; n++) {
            if (allowed_domain[n] !== parts[n]) {
                is_valid = false;
                break;
            }
        }
        if (is_valid) return true;
    }

    return false;
}

function check_flair(link, flair) {
    let distance = flair.distance ?? 0;
    if (flair.domain) {
        let domain = (link.split("/").filter(Boolean)[0] || "").toLowerCase();
        if (!is_allowed_domain(domain) && !check_domain(domain, flair)) return false;
    }

    return true;
}

const validate = module.exports.validate = function validate(link) {
    for (let flair of flairs) {
        if (!check_flair(link, flair)) {
            return false;
        }
    }
    return true;
}

module.exports.validate_message = async function validate_message(content, use_stop_phishing = true) {
    // see https://github.com/nikolaischunk/stop-discord-phishing/issues/3
    content = content.replace(/\bdiscord.gift\b(?![\.\-_\?])/g, "discord.com");
    let regex = /\w+:\/\/(\S+)/g; // crude but will match a superset of that of the urls
    let match;
    while (match = regex.exec(content)) {
        if (!validate(match[1])) {
            return [true, "Levenshtein(" + match[0] + ")"];
        }
    }

    if (use_stop_phishing && await stop_phishing.checkMessage(content, true)) {
        let findSuspiciousLink = stop_phishing.findSuspiciousLink || (async () => "");
        return [true, `stop-discord-phishing checkMessage(${await findSuspiciousLink(content)})`];
    }

    return [false, ""];
}
