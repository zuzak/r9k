var config = require('./package.json').config,
    irc = require('irc'),
    log = require('log-colors'),
    mongoose = require('mongoose'),
    _ = require('underscore'),
    nicknames = {};

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

client.addListener('message', function(nick, to, text, message) {
    log.info(nick + " · " + text);
});

// graceful quit
process.on('SIGINT', function() {
    log.info("^C found; shutting down...");
    config.irc.channels.forEach(function(chan) {
        client.say("chanserv", "SET " + chan + " GUARD ON");
        log.info("Telling ChanServ to join " + chan);
        client.part(chan,'Caught SIGINT');
    });
    client.disconnect('Caught SIGINT');
    process.exit();
});

client.addListener('names', function(channel, nicks) {
    log.info('Nicks for ' + channel + ' received.');
    for(var nick in nicks){
        nick = nick.toLowerCase();
        nicknames[nick] = nicks[nick];
        log.debug(nick + " stored.");
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
    var Message = mongoose.model('Message', msgSchema);
    
    client.addListener('message', function(nick, to, text, message){
        var stripped = stripMessage(text);
        Message.findOne({'contents':stripped},function(err, result){
            log.debug(result);
            if(result){
                // repetition!
                result.hitCount += 1;
                result.save(function(err){
                    if(err){log.err(err);}
                });
                log.info("[REPEAT] " + padTo16(nick) + text);
            } else {
                // new phrase
                var doc = new Message({
                    contents: stripped,
                    hitCount: 1
                });
                doc.save(function(err, savedDoc){
                    if(err){log.err(err);}
                    log.info("[ NEW! ] " + padTo16(nick) + text);
                }); 
            }
        });
    });
});

// strip messages for storage
function stripMessage(str){
    str = str.toLowerCase();

    // strip !alphanumerics
    str = str.replace(/[^\w\s]|_/g, '');

    // collapse whitespace
    log.debug("Splitting " + str);
    str = str.split(' ');
    log.debug("Split to " + str);

    // strip nicknames
    for(var id in str){
        var word = str[id];
        log.debug("Word is " + word);
        if(_.has(nicknames,word)){
            str[id] = '';
            log.debug(word + " stripped from sentence.");
        } else {
            log.debug(word + " not stripped from sentence.");
        } 
    }

    log.debug("Strip complete.");

    // collapse whitespace again
    
    str = str.join(" ");
    str = str.replace(/\s+/g,' ');
    
    return str;
}
    
function padTo16(str){
    str = str+"                ".slice(0,16);
    str = str + " | ";
    return str;
}
