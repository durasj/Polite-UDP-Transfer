var murmur = require('murmurhash-native/stream');
var fs = require('fs');

var hash = murmur.createHash('murmurhash32', {seed: 123, encoding: 'hex', endianness: 'platform'})
fs.createReadStream("C:\\Users\\Jakub\\Downloads\\ubuntu-16.04.2-desktop-amd64.iso").pipe(hash).pipe(process.stdout)
