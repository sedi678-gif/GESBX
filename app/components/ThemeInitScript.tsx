import Script from 'next/script';

const THEME_INIT = `(function(){try{var LANGS={az:1,en:1,ru:1,tr:1};var lang=localStorage.getItem('yolustu_app_language_v1');if(!LANGS[lang]){lang='az';var keys=Object.keys(localStorage);var bestAt=-1;for(var i=0;i<keys.length;i++){if(keys[i].indexOf('yolustu_user_settings_v1_')!==0)continue;var raw=localStorage.getItem(keys[i]);if(!raw)continue;try{var s=JSON.parse(raw);if(s&&LANGS[s.language]&&(typeof s.updatedAt==='number'?s.updatedAt:0)>=bestAt){bestAt=s.updatedAt||0;lang=s.language;}}catch(e){}}}document.documentElement.lang=lang;var k=Object.keys(localStorage).filter(function(x){return x.indexOf('yolustu_user_settings_v1_')===0;});var theme='dark';for(var i=0;i<k.length;i++){var raw=localStorage.getItem(k[i]);if(!raw)continue;var s=JSON.parse(raw);if(s&&s.appearance&&s.appearance.theme){theme=s.appearance.theme;break;}}var resolved=theme;if(theme==='system'){resolved=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}else if(theme==='light'){resolved='light';}else{resolved='dark';}document.documentElement.setAttribute('data-theme',resolved);document.documentElement.style.colorScheme=resolved;}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.lang='az';}})();`;

export function ThemeInitScript() {
  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {THEME_INIT}
    </Script>
  );
}
