const fs = require('fs');
const s = fs.readFileSync('node_modules/@zegocloud/zego-uikit-prebuilt/index.d.ts', 'utf8');
const start = s.indexOf('declare interface ZegoCallInvitationConfig');
console.log(s.slice(start, start + 4500));
