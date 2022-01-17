const assert = require("assert");
const {validate_message} = require("../validate.js");

describe("Test confirmed scam links", () => {
    async function assertBad(url) {
        assert((await validate_message(url, true))[0]);
    }

    async function assertGood(url) {
        assert(!(await validate_message(url, true))[0]);
    }

    it("Warmup", async () => {
        await assertGood("Hello world");
    });

    it("Simple links", async () => {
        await assertBad("https://dlscord-new-year.ru.com/gw20HkJ5qmqG13");
        await assertBad("https://discoqd.com/newyear");

        await assertGood("dlscord links are so spammy");

        await assertBad(
            `@everyone Hi Steam gives nitro gifts for 3 months for the new year\n` +
            `https://dlscord-new-year.ru.com/gw20HkJ5qmqG13 Only the account must not be empty, otherwise it will not be given\n` +
            `If they give a gift for a long time, then just wait. Sometimes you have to wait up to 2 days`
        );
    });
});
