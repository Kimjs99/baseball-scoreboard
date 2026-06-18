/**
 * 빌드: JSX(src/app.jsx) → 순수 JS, Tailwind 클래스 → 정적 CSS 로 사전 컴파일하여
 * apps-script/Index.html 을 생성한다.
 *
 * Apps Script 샌드박스에서는 브라우저 런타임 Babel/Tailwind 가 동작하지 않으므로
 * (CSP/iframe 제약) 런타임 변환 없이 인라인된 정적 JS/CSS 만 사용한다.
 */
const fs = require('fs');
const cp = require('child_process');
const Babel = require('@babel/standalone');

// 1) JSX → JS
const appSrc = fs.readFileSync('src/app.jsx', 'utf8');
const appJs = Babel.transform(appSrc, { presets: ['react'] }).code;

// 2) 템플릿에 컴파일된 JS 주입 (replace 콜백으로 $ 특수치환 방지)
let html = fs.readFileSync('src/index.template.html', 'utf8');
html = html.replace('/*__APP__*/', () => appJs);

// Tailwind 가 클래스를 스캔할 수 있도록 JS 가 들어간 중간본을 먼저 기록
fs.writeFileSync('apps-script/Index.html', html);

// 3) Tailwind: 위 Index.html 을 스캔해 실제 사용 클래스만 정적 CSS 로 생성
// .bin 래퍼(.cmd) 대신 node 로 CLI 진입점을 직접 실행 (크로스 플랫폼)
const twCli = require.resolve('tailwindcss/lib/cli.js');
cp.execFileSync(process.execPath, [
  twCli,
  '-c', 'tailwind.config.cjs',
  '-i', 'src/tw-input.css',
  '-o', 'build/tw.css',
  '--minify',
], { stdio: 'inherit' });
const css = fs.readFileSync('build/tw.css', 'utf8');

// 4) CSS 주입 후 최종본 기록
html = html.replace('/*__TAILWIND__*/', () => css);
fs.writeFileSync('apps-script/Index.html', html);
console.log('Built apps-script/Index.html (' + html.length + ' bytes, css ' + css.length + ' bytes)');
