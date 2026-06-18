/** Tailwind는 빌드 중간 산출물(컴파일된 JS가 들어간 Index.html)을 스캔해
 *  실제 사용된 클래스(임의값 shadow-[...] 포함)만 추출한다. */
module.exports = {
  content: ['./apps-script/Index.html'],
  theme: { extend: {} },
  plugins: [],
};
