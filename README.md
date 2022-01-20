# discord-no-phishy-links

A bot to block phishing attempts over discord.
It uses a combination of domain matching using [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance) (against keywords like "free nitro" and "discord"), and the [discord-phishing-links](https://github.com/nikolaischunk/discord-phishing-links) database to flag potential phishing attempts.

This is meant to be efficient against low-effort, credential-stealing attacks carried over on discord by hacked user accounts.

## Background

Discord has as of writing this been unable to block or mitigate this kind of attack.
For this attack to work, an account first needs to get stolen, by either getting the user to type out their credentials into a fake login window, or by running a token grabber.
The stolen accounts then spread a message inviting people to download the token grabber or to type in their credentials into a website mimicing Discord's website.

Variations of this attack have been seen: some claim a partnership between Steam and Discord and prompts users to log in to steam to claim some free nitro rewards.
Overall, the attacks share a set of key characteristics:

- a domain name resembling one of Discord's official domains (`discoqd.com` or `dlscord-new-year.ru.com` for instance)
- any reason for Discord to gift free subscriptions to users: be it the new year, halloween, a partnership with steam or twitch, christmas, etc
- the same message sent in every channel of the server by one user, with a ~1s delay

The [5D Chess discord](https://www.5dchesswithmultiversetimetravel.com/discord) has suffered several of these attacks, which is to be expected given its size (8K+ members).
While they were easy to mitigate (ban the user, tell discord to delete all of their messages and manually remove the messages that discord forgot to delete), we decided to go for an automated way of getting rid of these attacks.

There are a few options already available out there:

- [Phish Grabber](https://phishgrabber.dis.tf/), closed source
- [AntiScamLinksDiscord](https://github.com/LavenderCantCode/AntiScamLinksDiscord), open source

None of them quite fit our needs (being open source, being able to prevent future attacks, being able to host an instance of it for ourselves), so I wrote this bot.

## How it works

This bot scans every message sent in a discord server.
It uses two methods to detect potentially malicous URLs:

### Levenshtein distance

For each URL found (`/\w+:\/\/(\S+)/g`), the domain name is split from the rest of the URL.
The domain name is then split into components (separated by a period `.`), and permutations of `n`-grams (for now, `n ∈ {1, 2}`) are then matched against a set of keywords (defined in `flairs.json`).

A "flair" or keyword condition looks like this:

```json
{
    "domain": ["free", "discord"],
    "distance": 3
}
```

`domain` specified the keyword to match against, and `distance` the maximum distance between that keyword and the n-gram in the domain name.
If the `domain` field is an array, then every permutation of its members are generated: `freediscord` and `discordfree`.

Given a URL with domain `dicord4free.com`, for instance, the following distances will be considered:

- `levenshtein("com", "freediscord") <= distance`, yields `false`
- `levenshtein("com", "discordfree") <= distance`, yields `false`
- `levenshtein("discord4free", "freediscord") <= distance`, yields `false`
- `levenshtein("discord4free", "discordfree") <= distance`, yields `true`: the URL is flagged as malicious
- `levenshtein("discord4free.com", "freediscord") <= distance`, yields `false`
- `levenshtein("discord4free.com", "discordfree") <= distance`, yields `false`
- `levenshtein("com.discord4free", "freediscord") <= distance`, yields `false`
- `levenshtein("com.discord4free", "discordfree") <= distance`, yields `false`

Alternatively, for a URL with domain `discord4.free.fr`, the distance `levenshtein("discord4.free", "discordfree") = 2 <= distance` will yield true and the URL will be flagged as malicious.

This method would flag all of Discord's official URLs as malicious, so a whitelist is provided in `allowed_domains.json`.

### discord-phishing-links

This database is updated regularly as new attacks are recorded.
This bot uses a fork of the node module that reads and uses this database: [`adri326/stop-discord-phishing`](https://github.com/adri326/stop-discord-phishing), with some additional features over the official [`nikolaischunk/stop-discord-phishing`](https://github.com/nikolaischunk/stop-discord-phishing).

Here, the malicious domains/URLs are simply searched in the message and if any are found, the message is flagged as malicious.

The two methods are meant to complement each other. The `Levenshtein` method is meant to match at least `25%` of `discord-phishing-links`' database already (see tests).

### What happens once a malicious URL is found

Once such an URL is found, the bot will delete the message and send a private message to the author of the message.

The author will be given one warning. Warnings get cleared up after 24 hours, but sending another malicious URL will reset the timer.
After `user.warnings >= max_warnings` (defaults to `4` and configurable for each server), an `action` is taken on the user.
This action can be configured for each server and is one of:

- (attempt to) `ban` the user
- (attempt to) `kick` the user
- do nothing (`none`)

Finally, a report will be sent in a configured channel (the `notify_channel`), which will contain the following informations:

- message author, date, ID
- the algorithm that picked up the URL and the malicious URL
- the number of warnings that the user has
- the actions taken and whether or not they succeeded

Although this bot isn't meant to be deployed over a large number of servers ([which would otherwise require manual approval by Discord, for which we really don't have the time for](https://support.discord.com/hc/en-us/articles/4410940809111-Message-Content-Intent-Review-Policy)), its warning count is global, so users banned on one server for sending malicious links will be likely to face action upon sending their link for the first time in another server that the bot is in.

### Available commands

The bot has a set of commands available to see and edit the bot's server-specific settings.
The settings can only be changed by users with the `manageServer` permission, but they can be read by anyone.

- `/set-max-warnings <amount>`: sets the maximum number of warnings, beyond which action will be taken against the user
- `/set-action "none"|"ban"|"kick"`: sets the action to take against the user if they exceed they warning count
- `/set-notify-channel <channel>`: sets the channel to send reports in
- `/get-settings`: gets the settings for that server
