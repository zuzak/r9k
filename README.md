# r9k

*r9k* is a [ROBOT9000](http://blog.xkcd.com/2008/01/14/robot9000-and-xkcd-signal-attacking-noise-in-chat/) implementation in node.js.

It requires a [mongodb](http://www.mongodb.org) installation to work.

The bot monitors IRC channels, and punishes repetitive chat in an attempt to
increase the amount of signal to the amount of noise.

After stripping nicknames and punctuation, case insensitive strings are compared
with the database.

If there is a match, the offending user is muted (-v) for x^y seconds, where x
is the ``modifier`` set in the configuration (by default, 2), and *y* is
the number of transgressions the user has made.

## Configuration

Configuration is done by editing the config section of``package.json``.


```json
{
    "config": {
        "irc": {
            "server": "irc.freenode.net",
            "port": "6697",
            "ssl": true,
            "nick": "ROBOT9000",
            "ident": "r9k",
            "password": "hunter2",
            "channels": [
                "#defocus"
            ]
        },
        "mongo": {
            "db": "mongodb://localhost/r9k"
        },
        "moderator": {
            "active": true,
            "chanserv": true,
            "modifier": 2,
            "decay": 6
        },
        "verbosity": "chat"
    }
}
```

### IRC
* `server` defines the server the IRC bot will connect to.
* `port` will determine the port the bot connects through.
* Set `ssl` to `true` if the bot should connect securely.
* The `ident` setting defines the part of the hostname before the @:
  ``~ident@example.com``
* The ``password`` will be sent when connecting. Delete the line from the JSON
  file if unrequired.
* Place the channels the bot should automatically connect to via the
  ``channels`` array.

### Mongo
The bot requires a useable mongodb installation.
* Use ``db`` to set the correct URI, pointing towards the mongodb install.

### Moderator
* Toggle R9K using the ``active`` switch. When false, the bot will not devoice
  trangressors, and will merely log the chat.
* When ``chanserv`` is set, the bot will attempt to delegate operations to
  ChanServ. The bot will normally need +o set on its account.
* A higher ``modifier`` will make ban durations harsher. A lower ``modifier``
  will make ban durations more lenient. Should not be set lower than 1.
* The ``decay`` sets the number of hours it will take the bot to lower the ban
  level after a trangression.

## Miscellany
The ``verbosity`` levels determine how much data is output to the console.
Each level includes the ones beflow it:
* The *raw* data from the IRC server.
* *silly* outputs
* *debug* information
* Normal *info*rmational messages.
* *warn*ing messages
* *error* messages

