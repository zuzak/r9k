var config = require('./package.json').config,
    irc = require('irc'),
    winston = require('winston'),
    mongoose = require('mongoose'),
    _ = require('underscore'),
    nicknames = {};

// winston setup
var log = module.exports = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            colorize: true,
            level: config.verbosity
        })
    ],
    levels: {
        raw: 0,
        motd: 0,
        silly: 1,
        debug: 2,
        chat: 3,
        info: 4,
        warn: 5,
        error: 6
    },
    colors: {
        raw: 'grey',
        motd: 'cyan',
        silly: 'white',
        debug: 'blue',
        chat: 'cyan',
        info: 'green',
        warn: 'yellow',
        error: 'red'
    }
});

log.info("Starting up.");

// connect to IRC
var client = new irc.Client(config.irc.server, config.irc.nick, {
    secure: config.irc.ssl,
    channels: config.irc.channels,
    port: config.irc.port,
    userName: config.irc.ident,
    password: config.irc.password
});

// checking for 001
client.addListener('registered', function(message){
    log.info('Connected successfully to ' + config.irc.server);
//    client.say("nickserv","identify " + config.irc.password);
});

client.addListener('raw', function(message){
    if(message.rawCommand=="372"){
        log.motd(message.args.join(" "));
    } else {
        log.raw("%s [%s] : %s",message.command,message.rawCommand,message.args.join(" "));
    }
});

client.addListener('join', function(channel, nick, message){
    if(nick==config.irc.nick){
        log.info("Joined %s",channel);
        // new channel connection
        if(config.moderator.active){
            if(!config.moderator.chanserv){
                log.info("Requesting +o in %s",channel);
                client.say("chanserv","OP " + channel);
                log.info("Setting +m in %s",channel);
                client.send("MODE",channel,"+m");
            } else {
                log.info("Requesting +m in %s",channel);
                client.say("chanserv","SET " + channel + " mlock +m");
            }
        }
    }
});

// mongoose setup

mongoose.connect(config.mongo.db);
var db = mongoose.connection;

db.on('error', function(err) {
    log.error(err);
});
db.once('open', function callback() {
    log.info("Database connection successful.");
    var msgSchema = mongoose.Schema({
        contents: String,
        hitCount: Number
    });
    var nickSchema = mongoose.Schema({
        nickname: String
    });
    var banSchema = mongoose.Schema({
        nickname: String,
        duration: Number,
        active: Boolean
    });
    var Message = mongoose.model('Message', msgSchema);
    var Nickname = mongoose.model('Nickname',nickSchema);
    var Ban = mongoose.model('Ban',banSchema);
    
    client.addListener('message', function(nick, channel, text, message){
        var stripped = stripMessage(text);
        Message.findOne({'contents':stripped},function(err, result){
            if(result){
                // repetition!
                result.hitCount += 1;
                result.save(function(err){
                    if(err){log.err(err);}
                });
                log.chat(" *  <" + nick + "> " + text);
                
                Ban.findOne({'nickname':nick}, function(err, res){
                    if(res){
                        res.duration += 1;
                        res.active = true;
                    } else {
                        res = new Ban({
                            nickname: nick,
                            duration: 1,
                            active: true
                        });
                    }
                    res.save(function(err){
                        if(err){log.error(err)};
                        if(config.moderator.active){
                            if(config.moderator.chanserv){
                                client.say("chanserv","devoice " + channel + " " + nick);
                            } else {
                                client.send("mode",channel,"-v",nick);
                            }
                            var muteDuration = Math.pow(config.moderator.modifier,res.duration);
                            client.notice(channel,nick + " has been muted for " + muteDuration + " seconds.");
                            log.info("INFRACTION: muting " + nick + " for " + muteDuration + "s (" + config.moderator.modifier + "^" + res.duration + ")");
                            setTimeout(function(){
                                if(config.moderator.chanserv){
                                    log.info("RELEASE: requesting +v for " + nick + " after a " + muteDuration + "s ban");
                                    client.say("chanserv","voice " + channel + " " + nick);
                                } else {
                                    log.info("RELEASE: setting +v for " + nick + " after a " + muteDuration + "s ban");
                                    client.send("mode",channel,"+v",nick);
                                }
                                res.active = false;
                                res.save();
                            }, muteDuration * 1000);
                            setTimeout(function(){
                                Ban.findOne({'nickname':nick}, function(err, resu){
                                    if(resu.duration>1){
                                        resu.duration--;
                                    }
                                    log.info("Decaying ban history of " + nick + " by one level (now " + res.duration);
                                    resu.save();
                                });
                            },config.moderator.decay * 3600 * 1000);
                        }
                    });
                });
            } else {
                // new phrase
                var doc = new Message({
                    contents: stripped,
                    hitCount: 1
                });
                doc.save(function(err, savedDoc){
                    if(err){log.err(err);}
                    log.chat("    <" + nick + "> " + text);
                }); 
            }
        });
    });
    client.addListener('names', function(channel, nicks) {
        log.info("Nicks for %s received",channel);
        var nicknames = _.keys(nicks);
        for(var nick in nicks){
            nick = nick.toLowerCase();
            var newNick = new Nickname({
                nickname: nick
            });
            newNick.save(function(err, savedNick){
                if(err){log.error(err);}
                log.silly("Saved %s",savedNick.nickname);
            });
        }
    });
    client.addListener('join', function(channel, nick, message){
        log.info("%s joined %s",nick,channel);
        nickLower = nick.toLowerCase();
        var newNick = new Nickname({
            nickname: nickLower
        });
        newNick.save(function(err, savedNick){
            if(err){log.error(err);}
            log.silly("Saved %s",savedNick.nickname);
        });
        log.silly("Commencing ban check");

        if(config.moderator.active){
            log.silly("Searching for %s in bans",nick);
            Ban.findOne({'nickname':nickLower}, function(err, result){
                if(err){log.error(err);}
                if(!result || !result.active){
                    log.silly("%s not found in bans",nick);
                    if(config.moderator.chanserv){
                        log.info("Requesting +v for %s in %s",nick,channel);
                        client.say("chanserv","voice " + channel + " " + nick);
                    } else {
                        log.info("Setting +v on %s in %s",nick,channel);
                        try {
                            client.send("mode",channel,"-v",nick);
                            log.debug("Set!");
                        } catch(e) {
                            log.error("Unable to set +v on %s in %s",nick,channel);
                            log.error(e.message);
                        }
                    }
                }
            });
        }
    });
});

// strip messages for storage
function stripMessage(str){
    str = str.toLowerCase();

    // strip !alphanumerics
    str = str.replace(/[^\w\s]|_/g, '');

    // collapse whitespace
    str = str.split(' ');

    // strip nicknames
    for(var id in str){
        var word = str[id];
        if(_.has(nicknames,word)){
            str[id] = '';
        } 
    }

    // collapse whitespace again
    str = str.join(" ");
    str = str.replace(/\s+/g,' ');
    
    return str;
}
