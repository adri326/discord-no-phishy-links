const assert = require("assert");
const stop_phishing = require("stop-discord-phishing");
const {validate_message, validate} = require("../validate.js");

describe("Test confirmed scam links", () => {
    async function assertBad(url) {
        assert((await validate_message(url, true))[0], `${url} should be bad`);
    }

    async function assertGood(url) {
        assert(!(await validate_message(url, true))[0], `${url} should be good`);
    }

    it("Warmup", async () => {
        await assertGood("Hello world");
    });

    it("Simple links", async () => {
        await assertBad("https://dlscord-new-year.ru.com/gw20HkJ5qmqG13");
        await assertBad("https://discoqd.com/newyear");
        await assertBad("https://djscord-airdrops.com/F4d7nJU");

        await assertGood("dlscord links are so spammy");

        await assertBad(
            `@everyone Hi Steam gives nitro gifts for 3 months for the new year\n` +
            `https://dlscord-new-year.ru.com/gw20HkJ5qmqG13 Only the account must not be empty, otherwise it will not be given\n` +
            `If they give a gift for a long time, then just wait. Sometimes you have to wait up to 2 days`
        );
    });

    it("Discord's links", async () => {
        for (let domain of require("../allowed_domains.json")) {
            await assertGood(`https://${domain}/`);
            await assertGood(`https://free-nitro.${domain}/`);
            await assertGood(`http://${domain}/`);
            await assertGood(`http://free-nitro.${domain}/`);
        }
    });

    it("Match at least 25% of stop-discord-phishing's database", async () => {
        let domains = await stop_phishing.listDomains();
        let matched = 0;
        let promiseses = [];
        for (let domain of domains) {
            let res = await validate_message(`http://${domain}/`, false);
            if (res[0]) {
                matched++;
            }
        }
        assert(matched >= domains.length * .25, `${matched} matched out of ${domains.length}`);
    });
});
