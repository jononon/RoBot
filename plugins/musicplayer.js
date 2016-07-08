// Process Flow:
// 1. User Requests Song by searching, or placing in youtube url
// 2. vexBot locates user's voice channel, but realistically, we just want it playing in music channel
// 3. vexBot downloads music into temp directory, and plays that.
// 4. vexBot deques music.
// While vexBot not in use, play 118 songs.

var http = require('http');
var fs = require('fs');
var exec = require('child_process').exec;
var ytdl = require('ytdl-core');

var DOWNLOAD_DIR = './musics/';

var audioStream = null;
var currentVoiceChannel = null;
var currentSong = null;
var queue       = Array();
var skipSet     = new Set();

function convertFlvToMp3(source_file, destination_dir, callback) {
  var destination_file = source_file.split('/').slice(-1)[0].replace('.flv', '.mp3');

  var ffmpeg = 'ffmpeg -i '+ source_file + ' ' + destination_dir + destination_file;
  var child = exec(ffmpeg, function(err, stdout, stderr) {
    if(err) {
      callback(err);
    } else {
      //Delete the movie file from the directory
      var rm = 'rm ' + source_file;
      console.log(source_file.split('/').slice(-1)[0] +' converted to '+ destination_file);
      callback();
      exec(rm, function (err, stdout, stderr) {
        if (err) {
          console.log(error);
        }
      });
    }
  }); //Exec ffmpeg
}


function downloadVideo(url, dir_dest, file_dest, callback) {
  var stream = ytdl(url).pipe(fs.createWriteStream(dir_dest + file_dest));
  stream.on('finish', function () {
    convertFlvToMp3(dir_dest + file_dest, dir_dest, callback);
  });
}


function YoutubeSong(videoUrl, username, userID) {

  //Validates URL
  var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\?v=)([^#\&\?]*).*/;
  var match = videoUrl.match(regExp);

  if (match && match[2].length == 11) {
    this.videoUrl = videoUrl;
    this.username = username;
    this.userID = userID;
    this.isValid = true;

    //Extract the video's ID from the url
    this.id = this.videoUrl.split('v=')[1];
    var ampersandPosition = this.id.indexOf('&');
    if(ampersandPosition != -1) {
      this.id = this.id.substring(0, ampersandPosition);
    }

  } else {
    this.isValid = false;
  }

  YoutubeSong.prototype.downloadSong = function(callback) {
    var dir_dest = DOWNLOAD_DIR;
    var file_dest = this.id + '.flv';
    downloadVideo(
      this.videoUrl,
      dir_dest,
      file_dest,
      callback
    );
  }
}


function addSong(url, username, userID) {
  if(url && url.length > 0) {

    var youtubeSong = new YoutubeSong(url, username, userID);
    var exist = false;

    var files = fs.readdirSync(DOWNLOAD_DIR);
    for (var i = 0; i < files.length; i++) {
      if(files[i] == youtubeSong.id + '.mp3') {
        exist = true;
        break;
      }
    }

    if(exist && youtubeSong.isValid) {
      console.log('Music already download, adding to queue...');
      queue.push(youtubeSong);
      if(currentSong == null) {
        start();
      }
    } else {
      //If url is wrong
      if(youtubeSong.isValid) {
        youtubeSong.downloadSong(function (err) {
          if(err) {
            console.error(err);
            sendMessage('@' + youtubeSong.username + ' Impossible to load ' + youtubeSong.url);
          } else {
            queue.push(youtubeSong);
            if(currentSong == null) {
              start();
            }
          }
        });
      }
    }
  }
}

//reset the queue
function reset() {
  stop();
  queue.length = 0
}

//Start the first song in the queue
function start() {
  if(queue.length > 0) {
    currentSong = queue[0];
    if(currentSong && currentSong.isValid) {
      var songPath = DOWNLOAD_DIR + currentSong.id + '.mp3';
      audioStream.playAudioFile(songPath);
      audioStream.once('fileEnd', songEnded);
    }
  } else {
    currentSong = null;
  }

}

function songEnded() {
  console.log("songEnded");
  queue.shift();
  start();
}

//Stop the audio
function stop() {
  audioStream.stopAudioFile();
  currentSong = null;
}

//Start the next song if there is one
function nextSong() {
  console.log("stop");
  stop();
}


//Skip if more than 50% of the users have typed !skip
//TODO: check for user in the same voice channel
function skip(userID) {

  skipSet.add(userID);
  var skipSum = skipSet.size;

  var onlineMembers = 0;
  var serverID = Object.keys(vexBot.servers)[0]; //Only one server
  for (var memberID in vexBot.servers[serverID].members) {
    if (vexBot.servers[serverID].members[memberID].status == 'online') {
      onlineMembers++;
    }
  }

  console.log('onlineMembers = ' + (onlineMembers-1));
  console.log('skipSum : ' + skipSum);
  console.log('(onlineMembers-1 / 2) : ' + (onlineMembers-1 / 2));
  console.log('Condition : ' + (skipSum > (onlineMembers-1 / 2)));
  console.log(skipSet);

  if (skipSum > (onlineMembers-1 / 2)) {
    if (queue.length > 0) {
      nextSong();
    }
    console.log('Skipped song')
    skipSet.clear();
  }
}


//Return the voice channel where the user is
function findVoiceChannelIdWhereUserIs(userID) {
  var voiceChannel = null;
  for(var s in vexBot.servers) {
    for(var uID in vexBot.servers[s].members) {
      if(uID == userID) {
        voiceChannel = vexBot.servers[s].members[uID].voice_channel_id;
      }
    }
  }

  return voiceChannel;
}

//Join the voice channel where the user is
function joinChannel(userID, channelID) {
  currentVoiceChannel = findVoiceChannelIdWhereUserIs(userID);

  vexBot.client.joinVoiceChannel(currentVoiceChannel, function () {
    vexBot.client.getAudioContext({channel: currentVoiceChannel, stereo: true}, function(stream) {
        audioStream = stream;
    });
  });
}

vexBot.commands.play = function(data) {
  joinChannel(data.id, data.channel);
  addSong(data.message, data.name, data.id);
}
vexBot.commandUsage.play = "<youtube url>";
vexBot.commandDescs.play = "Plays the audio from a YouTube video";
