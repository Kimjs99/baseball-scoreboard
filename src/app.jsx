const { useState } = React;

    // doGet 템플릿에서 주입되는 현재 웹앱(/exec) URL. 결과 전송 기본값으로 사용.
    const WEB_APP_URL = "<?= webAppUrl ?>";

    // 유틸리티: 타율 계산 포맷 (예: 0.333 -> .333)
    const formatAvg = (hits, atBats) => {
      if (atBats === 0) return '.000';
      const avg = (hits / atBats).toFixed(3);
      return avg.startsWith('0.') ? avg.substring(1) : avg;
    };

    // 유틸리티: 초기 라인업 생성 (15명 기준)
    const generateLineup = (prefix) => {
      return Array.from({ length: 15 }, (_, i) => ({
        id: i,
        order: i + 1,
        name: `${prefix} 타자 ${i + 1}`,
        atBats: 0,
        hits: 0,
      }));
    };

    function BaseballScoreboard() {
      // --- 게임 상태 ---
      const [inning, setInning] = useState(1);
      const [isTop, setIsTop] = useState(true);

      const [awayTeam, setAwayTeam] = useState({
        name: 'AWAY',
        scores: Array(9).fill(0), // 기본 9이닝 유지, 연장 시 동적 추가
        runs: 0,
        hits: 0,
        errors: 0,
        lineup: generateLineup('어웨이'),
        currentBatter: 0,
      });

      const [homeTeam, setHomeTeam] = useState({
        name: 'HOME',
        scores: Array(9).fill(0),
        runs: 0,
        hits: 0,
        errors: 0,
        lineup: generateLineup('홈'),
        currentBatter: 0,
      });

      const [balls, setBalls] = useState(0);
      const [strikes, setStrikes] = useState(0);
      const [outs, setOuts] = useState(0);
      const [bases, setBases] = useState({ first: false, second: false, third: false });

      // 상태 기록 저장소 (Undo용)
      const [history, setHistory] = useState([]);

      // --- 설정(구글 시트 연동 및 수동 입력) 상태 ---
      const [isSettingsOpen, setIsSettingsOpen] = useState(false);
      const [sheetUrl, setSheetUrl] = useState('');
      const [tempAwayName, setTempAwayName] = useState('');
      const [tempHomeName, setTempHomeName] = useState('');
      const [settingsTab, setSettingsTab] = useState('manual');
      const [tempAwayLineup, setTempAwayLineup] = useState(Array(15).fill(''));
      const [tempHomeLineup, setTempHomeLineup] = useState(Array(15).fill(''));

      // 결과 내보내기(저장) 상태
      const [isExportOpen, setIsExportOpen] = useState(false);
      const [webhookUrl, setWebhookUrl] = useState(WEB_APP_URL || '');

      // 커스텀 다이얼로그(alert/confirm 대체) 상태
      const [dialog, setDialog] = useState({ isOpen: false, message: '', isConfirm: false, onConfirm: null });

      // 현재 공격 팀 정보 가져오기
      const currentTeam = isTop ? awayTeam : homeTeam;
      const currentBatter = currentTeam.lineup[currentTeam.currentBatter];

      // --- 커스텀 다이얼로그 헬퍼 ---
      const showMessage = (msg) => {
        setDialog({ isOpen: true, message: msg, isConfirm: false, onConfirm: null });
      };

      const showConfirm = (msg, onConfirmFn) => {
        setDialog({ isOpen: true, message: msg, isConfirm: true, onConfirm: onConfirmFn });
      };

      // --- 코어 로직 ---
      const saveHistory = () => {
        const cloneTeam = (team) => JSON.parse(JSON.stringify(team));
        setHistory((prev) => [
          ...prev,
          {
            inning,
            isTop,
            balls,
            strikes,
            outs,
            bases: { ...bases },
            awayTeam: cloneTeam(awayTeam),
            homeTeam: cloneTeam(homeTeam),
          },
        ]);
      };

      const advanceBatter = () => {
        const teamSetter = isTop ? setAwayTeam : setHomeTeam;
        teamSetter((prev) => ({
          ...prev,
          currentBatter: (prev.currentBatter + 1) % 15,
        }));
        setBalls(0);
        setStrikes(0);
      };

      const switchInning = () => {
        setBases({ first: false, second: false, third: false });
        setBalls(0);
        setStrikes(0);
        setOuts(0);
        if (!isTop) {
          setInning((prev) => prev + 1);
        }
        setIsTop(!isTop);
      };

      const addOut = () => {
        if (outs + 1 >= 3) {
          // 3아웃: 다음에 이 팀이 공격할 때 다음 타자부터 시작하도록 타순을 먼저 넘긴 뒤 이닝 교체
          advanceBatter();
          switchInning();
        } else {
          setOuts(outs + 1);
          advanceBatter();
        }
      };

      const updateStats = (runsScored, isHit, isAtBat) => {
        const teamSetter = isTop ? setAwayTeam : setHomeTeam;

        teamSetter((prev) => {
          const newScores = [...prev.scores];
          while (newScores.length < inning) newScores.push(0);
          newScores[inning - 1] += runsScored;

          const newLineup = [...prev.lineup];
          const batter = { ...newLineup[prev.currentBatter] };
          if (isAtBat) batter.atBats += 1;
          if (isHit) batter.hits += 1;
          newLineup[prev.currentBatter] = batter;

          return {
            ...prev,
            scores: newScores,
            runs: prev.runs + runsScored,
            hits: prev.hits + (isHit ? 1 : 0),
            lineup: newLineup,
          };
        });
      };

      // --- 이벤트 핸들러 ---
      const handleBall = () => {
        saveHistory();
        if (balls + 1 === 4) {
          let runsScored = 0;
          const newBases = { ...bases };

          if (bases.first && bases.second && bases.third) {
            runsScored = 1;
          } else if (bases.first && bases.second) {
            newBases.third = true;
          } else if (bases.first) {
            newBases.second = true;
          }
          newBases.first = true;

          setBases(newBases);
          updateStats(runsScored, false, false);
          advanceBatter();
        } else {
          setBalls(balls + 1);
        }
      };

      const handleStrike = () => {
        saveHistory();
        if (strikes + 1 === 3) {
          updateStats(0, false, true);
          addOut();
        } else {
          setStrikes(strikes + 1);
        }
      };

      const handleFoul = () => {
        saveHistory();
        if (strikes < 2) {
          setStrikes(strikes + 1);
        }
      };

      const handleHit = (type) => {
        saveHistory();
        let runsScored = 0;
        const newBases = { ...bases };

        if (type === 1) {
          if (bases.third) { runsScored++; newBases.third = false; }
          if (bases.second) { newBases.third = true; newBases.second = false; }
          if (bases.first) { newBases.second = true; }
          newBases.first = true;
        } else if (type === 2) {
          if (bases.third) { runsScored++; newBases.third = false; }
          if (bases.second) { runsScored++; newBases.second = false; }
          if (bases.first) { newBases.third = true; newBases.first = false; }
          newBases.second = true;
        } else if (type === 3) {
          if (bases.third) runsScored++;
          if (bases.second) runsScored++;
          if (bases.first) runsScored++;
          newBases.first = false; newBases.second = false; newBases.third = true;
        } else if (type === 4) {
          if (bases.third) runsScored++;
          if (bases.second) runsScored++;
          if (bases.first) runsScored++;
          runsScored++;
          newBases.first = false; newBases.second = false; newBases.third = false;
        }

        setBases(newBases);
        updateStats(runsScored, true, true);
        advanceBatter();
      };

      const handleOutAction = () => {
        saveHistory();
        updateStats(0, false, true);
        addOut();
      };

      const handleUndo = () => {
        if (history.length === 0) return;
        const lastState = history[history.length - 1];
        setInning(lastState.inning);
        setIsTop(lastState.isTop);
        setBalls(lastState.balls);
        setStrikes(lastState.strikes);
        setOuts(lastState.outs);
        setBases(lastState.bases);
        setAwayTeam(lastState.awayTeam);
        setHomeTeam(lastState.homeTeam);
        setHistory((prev) => prev.slice(0, -1));
      };

      const resetGame = () => {
        showConfirm("게임을 정말로 초기화하시겠습니까?", () => {
          setInning(1);
          setIsTop(true);
          setBalls(0);
          setStrikes(0);
          setOuts(0);
          setBases({ first: false, second: false, third: false });
          setAwayTeam((prev) => ({ ...prev, scores: Array(9).fill(0), runs: 0, hits: 0, errors: 0, currentBatter: 0 }));
          setHomeTeam((prev) => ({ ...prev, scores: Array(9).fill(0), runs: 0, hits: 0, errors: 0, currentBatter: 0 }));
          setHistory([]);
        });
      };

      // --- 명단 및 설정 처리 로직 ---
      const openSettings = () => {
        setTempAwayName(awayTeam.name);
        setTempHomeName(homeTeam.name);
        setTempAwayLineup(awayTeam.lineup.map(b => b.name));
        setTempHomeLineup(homeTeam.lineup.map(b => b.name));
        setIsSettingsOpen(true);
      };

      const handleApplySettings = async () => {
        let parsedAwayLineup = [...awayTeam.lineup];
        let parsedHomeLineup = [...homeTeam.lineup];

        if (settingsTab === 'csv' && sheetUrl.trim()) {
          try {
            const res = await fetch(sheetUrl);
            const text = await res.text();
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

            const newAwayLineup = Array(15).fill(null);
            const newHomeLineup = Array(15).fill(null);

            lines.forEach((line) => {
              const [teamType, orderStr, name] = line.split(',');
              if (!teamType || !orderStr || !name) return;

              const team = teamType.trim().toUpperCase();
              const order = parseInt(orderStr, 10);

              if (isNaN(order) || order < 1 || order > 15) return;

              const batter = { id: order - 1, order, name: name.trim(), atBats: 0, hits: 0 };

              if (team === 'AWAY') newAwayLineup[order - 1] = batter;
              if (team === 'HOME') newHomeLineup[order - 1] = batter;
            });

            parsedAwayLineup = newAwayLineup.map((b, i) => b || awayTeam.lineup[i]);
            parsedHomeLineup = newHomeLineup.map((b, i) => b || homeTeam.lineup[i]);

            showMessage('명단이 성공적으로 적용되었습니다.');
          } catch (err) {
            showMessage('데이터를 불러오는데 실패했습니다. CSV 링크와 형식을 확인해주세요.');
            return;
          }
        } else if (settingsTab === 'manual') {
          parsedAwayLineup = parsedAwayLineup.map((b, i) => ({ ...b, name: tempAwayLineup[i] || `어웨이 타자 ${i+1}` }));
          parsedHomeLineup = parsedHomeLineup.map((b, i) => ({ ...b, name: tempHomeLineup[i] || `홈 타자 ${i+1}` }));
        }

        setAwayTeam(prev => ({ ...prev, name: tempAwayName || 'AWAY', lineup: parsedAwayLineup }));
        setHomeTeam(prev => ({ ...prev, name: tempHomeName || 'HOME', lineup: parsedHomeLineup }));
        setIsSettingsOpen(false);
      };

      // --- 결과 내보내기(저장) 로직 ---
      const handleExportCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,﻿";
        csvContent += "구분,1,2,3,4,5,6,7,8,9,R,H,E\n";
        csvContent += `${awayTeam.name},${awayTeam.scores.slice(0,9).join(',')},${awayTeam.runs},${awayTeam.hits},${awayTeam.errors}\n`;
        csvContent += `${homeTeam.name},${homeTeam.scores.slice(0,9).join(',')},${homeTeam.runs},${homeTeam.hits},${homeTeam.errors}\n\n`;

        csvContent += "팀,타순,이름,타수,안타,타율\n";
        awayTeam.lineup.forEach(b => {
          csvContent += `${awayTeam.name},${b.order},${b.name},${b.atBats},${b.hits},${formatAvg(b.hits, b.atBats)}\n`;
        });
        homeTeam.lineup.forEach(b => {
          csvContent += `${homeTeam.name},${b.order},${b.name},${b.atBats},${b.hits},${formatAvg(b.hits, b.atBats)}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `야구_경기결과_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      const handleExportWebhook = async () => {
        if (!webhookUrl) {
          showMessage('웹앱 URL을 입력해주세요.');
          return;
        }
        const payload = {
          date: new Date().toLocaleString(),
          awayTeam: { name: awayTeam.name, runs: awayTeam.runs, hits: awayTeam.hits, scores: awayTeam.scores, lineup: awayTeam.lineup },
          homeTeam: { name: homeTeam.name, runs: homeTeam.runs, hits: homeTeam.hits, scores: homeTeam.scores, lineup: homeTeam.lineup }
        };
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          showMessage('데이터 전송이 완료되었습니다.');
          setIsExportOpen(false);
        } catch (e) {
          showMessage('전송 중 오류가 발생했습니다. URL을 확인해주세요.');
        }
      };

      // --- UI 렌더링 ---
      const displayInnings = Math.max(9, inning);
      const inningColumns = Array.from({ length: displayInnings }, (_, i) => i + 1);

      return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-8 select-none relative">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* 헤더 및 스코어보드 테이블 */}
            <div className="bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-xl border border-gray-700">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-yellow-400">BASEBALL SCOREBOARD</h1>
                <div className="flex items-center flex-wrap gap-4">
                  <div className="text-lg font-bold w-full md:w-auto text-right mb-2 md:mb-0">
                    {inning}회 {isTop ? '초' : '말'}
                  </div>
                  <button onClick={() => setIsExportOpen(true)} className="bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border border-green-600 flex-1 md:flex-none">
                    📤 결과 저장
                  </button>
                  <button onClick={openSettings} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border border-gray-600 flex-1 md:flex-none">
                    ⚙️ 팀 설정
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-sm sm:text-base whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-gray-600 text-gray-400">
                      <th className="text-left py-2 px-3 font-semibold">TEAM</th>
                      {inningColumns.map((i) => (
                        <th key={i} className="py-2 px-2 sm:px-4">{i}</th>
                      ))}
                      <th className="py-2 px-3 sm:px-4 font-bold text-white">R</th>
                      <th className="py-2 px-3 sm:px-4 font-bold text-white">H</th>
                      <th className="py-2 px-3 sm:px-4 font-bold text-white">E</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={isTop ? "bg-gray-700/50" : ""}>
                      <td className="text-left py-3 px-3 font-bold text-blue-400">{awayTeam.name}</td>
                      {inningColumns.map((i) => (
                        <td key={i} className="py-3 px-2 sm:px-4 text-gray-200">
                          {(i < inning || (i === inning && !isTop)) ? awayTeam.scores[i - 1] : (i === inning && isTop ? awayTeam.scores[i - 1] : '-')}
                        </td>
                      ))}
                      <td className="py-3 px-3 sm:px-4 font-bold text-yellow-400">{awayTeam.runs}</td>
                      <td className="py-3 px-3 sm:px-4 font-bold">{awayTeam.hits}</td>
                      <td className="py-3 px-3 sm:px-4 font-bold text-gray-500">{awayTeam.errors}</td>
                    </tr>
                    <tr className={!isTop ? "bg-gray-700/50" : ""}>
                      <td className="text-left py-3 px-3 font-bold text-red-400">{homeTeam.name}</td>
                      {inningColumns.map((i) => (
                        <td key={i} className="py-3 px-2 sm:px-4 text-gray-200">
                          {i < inning ? homeTeam.scores[i - 1] : (i === inning && !isTop ? homeTeam.scores[i - 1] : '-')}
                        </td>
                      ))}
                      <td className="py-3 px-3 sm:px-4 font-bold text-yellow-400">{homeTeam.runs}</td>
                      <td className="py-3 px-3 sm:px-4 font-bold">{homeTeam.hits}</td>
                      <td className="py-3 px-3 sm:px-4 font-bold text-gray-500">{homeTeam.errors}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 메인 경기장 표시부 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* 1. 카운트 (B/S/O) */}
              <div className="bg-gray-800 p-6 rounded-2xl flex flex-col justify-center border border-gray-700">
                <div className="space-y-4">
                  <div className="flex items-center">
                    <span className="w-8 text-xl font-bold text-green-500">B</span>
                    <div className="flex gap-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className={`w-8 h-8 rounded-full border-2 border-gray-600 ${i < balls ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="w-8 text-xl font-bold text-yellow-500">S</span>
                    <div className="flex gap-3">
                      {[0, 1].map((i) => (
                        <div key={i} className={`w-8 h-8 rounded-full border-2 border-gray-600 ${i < strikes ? 'bg-yellow-500 shadow-[0_0_10px_#eab308]' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="w-8 text-xl font-bold text-red-500">O</span>
                    <div className="flex gap-3">
                      {[0, 1].map((i) => (
                        <div key={i} className={`w-8 h-8 rounded-full border-2 border-gray-600 ${i < outs ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. 다이아몬드 (베이스 상태) */}
              <div className="bg-gray-800 p-6 rounded-2xl flex items-center justify-center border border-gray-700 relative z-0">
                <div className="grid grid-cols-3 grid-rows-3 gap-2 w-48 h-48 rotate-45 transform">
                  <div className="col-start-1 row-start-1 w-full h-full p-2">
                    <div className={`w-full h-full rounded-sm ${bases.second ? 'bg-yellow-400 shadow-[0_0_15px_#facc15]' : 'bg-gray-700 border-2 border-gray-600'}`}></div>
                  </div>
                  <div className="col-start-3 row-start-1 w-full h-full p-2">
                    <div className={`w-full h-full rounded-sm ${bases.first ? 'bg-yellow-400 shadow-[0_0_15px_#facc15]' : 'bg-gray-700 border-2 border-gray-600'}`}></div>
                  </div>
                  <div className="col-start-1 row-start-3 w-full h-full p-2">
                    <div className={`w-full h-full rounded-sm ${bases.third ? 'bg-yellow-400 shadow-[0_0_15px_#facc15]' : 'bg-gray-700 border-2 border-gray-600'}`}></div>
                  </div>

                  {/* 홈 플레이트 (오각형) - 회전된 컨테이너 안에서 다시 역회전하여 모양 유지 */}
                  <div className="col-start-3 row-start-3 w-full h-full flex items-center justify-center" style={{ filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.8))' }}>
                    <div className="w-full h-full bg-white" style={{ transform: 'rotate(-45deg) scale(0.9)', clipPath: 'polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%)' }}></div>
                  </div>

                  {/* 내야 선 (장식용) */}
                  <div className="absolute inset-[15%] border-4 border-gray-600 -z-10 rounded-sm"></div>
                </div>
              </div>

              {/* 3. 현재 타자 정보 */}
              <div className="bg-gray-800 p-6 rounded-2xl flex flex-col justify-between border border-gray-700">
                <div>
                  <div className="text-sm text-gray-400 mb-1 font-semibold tracking-wider">NOW BATTING</div>
                  <div className="text-yellow-400 font-bold text-xl mb-4">
                    {currentTeam.name}
                  </div>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-4xl font-black text-white">{currentBatter.order}번</span>
                    <span className="text-2xl text-gray-200 truncate">{currentBatter.name}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-gray-900 p-3 rounded-lg border border-gray-700 text-center">
                    <div className="text-xs text-gray-500 mb-1">AVG (타율)</div>
                    <div className="text-2xl font-mono text-white">{formatAvg(currentBatter.hits, currentBatter.atBats)}</div>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-lg border border-gray-700 text-center">
                    <div className="text-xs text-gray-500 mb-1">H / AB (안타/타수)</div>
                    <div className="text-xl font-mono text-gray-300 mt-1">{currentBatter.hits} / {currentBatter.atBats}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 컨트롤 패널 */}
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
              <div className="text-sm text-gray-400 mb-4 font-semibold tracking-wider">ACTION PANEL</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-2">
                  <button onClick={handleBall} className="py-3 px-4 bg-green-900/50 hover:bg-green-800 text-green-400 font-bold rounded-xl border border-green-700 transition-colors">볼 (Ball)</button>
                  <button onClick={handleStrike} className="py-3 px-4 bg-yellow-900/50 hover:bg-yellow-800 text-yellow-400 font-bold rounded-xl border border-yellow-700 transition-colors">스트라이크 (Strike)</button>
                  <button onClick={handleFoul} className="py-3 px-4 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded-xl border border-gray-500 transition-colors">파울 (Foul)</button>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => handleHit(1)} className="py-3 px-4 bg-blue-900/50 hover:bg-blue-800 text-blue-400 font-bold rounded-xl border border-blue-700 transition-colors">1루타 (1B)</button>
                  <button onClick={() => handleHit(2)} className="py-3 px-4 bg-blue-900/50 hover:bg-blue-800 text-blue-400 font-bold rounded-xl border border-blue-700 transition-colors">2루타 (2B)</button>
                  <button onClick={() => handleHit(3)} className="py-3 px-4 bg-blue-900/50 hover:bg-blue-800 text-blue-400 font-bold rounded-xl border border-blue-700 transition-colors">3루타 (3B)</button>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => handleHit(4)} className="py-3 px-4 bg-purple-900/50 hover:bg-purple-800 text-purple-400 font-bold rounded-xl border border-purple-700 transition-colors">홈런 (HR)</button>
                  <button onClick={handleOutAction} className="py-3 px-4 bg-red-900/50 hover:bg-red-800 text-red-400 font-bold rounded-xl border border-red-700 transition-colors h-full">타격 아웃 (Out)</button>
                </div>

                <div className="flex flex-col gap-2 justify-end">
                   <button
                     onClick={handleUndo}
                     disabled={history.length === 0}
                     className={`py-3 px-4 font-bold rounded-xl border transition-colors mt-auto ${
                       history.length === 0
                         ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                         : 'bg-orange-900/50 hover:bg-orange-800 text-orange-400 border-orange-700'
                     }`}>
                     되돌리기 (Undo)
                   </button>
                   <button onClick={resetGame} className="py-3 px-4 bg-gray-900 hover:bg-black text-gray-500 font-bold rounded-xl border border-gray-800 transition-colors">게임 리셋</button>
                </div>
              </div>
            </div>

          </div>

          {/* 설정 모달 (명단 연동 및 수동 입력) */}
          {isSettingsOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl border border-gray-700 w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
                <h2 className="text-2xl font-bold text-white mb-4">팀 설정 및 명단 관리 (최대 15명)</h2>

                {/* 탭 메뉴 */}
                <div className="flex gap-4 mb-6 border-b border-gray-700 pb-2">
                  <button
                    onClick={() => setSettingsTab('manual')}
                    className={`px-4 py-2 font-bold rounded-lg transition-colors ${settingsTab === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                  >
                    수동 입력
                  </button>
                  <button
                    onClick={() => setSettingsTab('csv')}
                    className={`px-4 py-2 font-bold rounded-lg transition-colors ${settingsTab === 'csv' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                  >
                    구글 시트(CSV) 연동
                  </button>
                </div>

                <div className="space-y-5 overflow-y-auto pr-2 flex-1 custom-scrollbar">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">어웨이 팀명</label>
                      <input type="text" value={tempAwayName} onChange={(e) => setTempAwayName(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">홈 팀명</label>
                      <input type="text" value={tempHomeName} onChange={(e) => setTempHomeName(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>

                  {settingsTab === 'manual' ? (
                    <div className="grid grid-cols-2 gap-6 mt-4">
                      <div>
                        <h3 className="text-blue-400 font-bold mb-3 text-sm">어웨이 명단 (AWAY)</h3>
                        {tempAwayLineup.map((name, i) => (
                          <div key={`away-${i}`} className="flex items-center gap-2 mb-2">
                            <span className="w-6 text-center text-gray-400 text-sm font-bold">{i + 1}</span>
                            <input
                              type="text"
                              value={name}
                              onChange={(e) => {
                                const newArr = [...tempAwayLineup];
                                newArr[i] = e.target.value;
                                setTempAwayLineup(newArr);
                              }}
                              className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                              placeholder={`어웨이 타자 ${i + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div>
                        <h3 className="text-red-400 font-bold mb-3 text-sm">홈 명단 (HOME)</h3>
                        {tempHomeLineup.map((name, i) => (
                          <div key={`home-${i}`} className="flex items-center gap-2 mb-2">
                            <span className="w-6 text-center text-gray-400 text-sm font-bold">{i + 1}</span>
                            <input
                              type="text"
                              value={name}
                              onChange={(e) => {
                                const newArr = [...tempHomeLineup];
                                newArr[i] = e.target.value;
                                setTempHomeLineup(newArr);
                              }}
                              className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                              placeholder={`홈 타자 ${i + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-bold text-blue-400 mb-2">구글 시트 연동 (CSV 웹 게시 링크)</label>
                      <input
                        type="text"
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                      <div className="mt-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700 text-xs text-gray-400 leading-relaxed">
                        <p className="font-semibold text-gray-300 mb-1">💡 구글 시트 작성 양식 (첫 줄은 무시됩니다)</p>
                        <p>A열: <b>AWAY</b> 또는 <b>HOME</b></p>
                        <p>B열: 타순 번호 (<b>1</b> ~ <b>15</b>)</p>
                        <p>C열: 선수 이름</p>
                        <p className="mt-2 text-yellow-500/80">* 작성 후 [파일] - [공유] - [웹에 게시] 메뉴에서 포맷을 <b>CSV</b>로 선택하고 링크를 복사하여 붙여넣으세요.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
                  <button onClick={() => setIsSettingsOpen(false)} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors">취소</button>
                  <button onClick={handleApplySettings} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors">저장 및 명단 적용</button>
                </div>
              </div>
            </div>
          )}

          {/* 결과 내보내기 모달 */}
          {isExportOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl flex flex-col">
                <h2 className="text-2xl font-bold text-white mb-6">경기 결과 저장 및 내보내기</h2>

                <div className="space-y-6">
                  <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                    <h3 className="text-lg font-bold text-green-400 mb-2">1. CSV 파일로 다운로드</h3>
                    <p className="text-sm text-gray-400 mb-4">현재까지의 스코어보드와 타자 기록을 엑셀에서 열 수 있는 CSV 파일로 즉시 저장합니다.</p>
                    <button onClick={handleExportCSV} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors">
                      다운로드 실행
                    </button>
                  </div>

                  <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                    <h3 className="text-lg font-bold text-blue-400 mb-2">2. 구글 시트로 바로 전송 (자동)</h3>
                    <p className="text-sm text-gray-400 mb-3">현재 배포된 웹앱 URL이 기본 입력되어 있습니다. 그대로 전송하면 배포 계정의 구글 시트에 기록이 저장됩니다.</p>
                    <input
                      type="text"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 mb-3"
                    />
                    <button onClick={handleExportWebhook} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors">
                      구글 시트로 전송
                    </button>
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <button onClick={() => setIsExportOpen(false)} className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors">닫기</button>
                </div>
              </div>
            </div>
          )}

          {/* 시스템 알림 및 확인 다이얼로그 커스텀 UI */}
          {dialog.isOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
              <div className="bg-gray-800 border border-gray-600 p-6 sm:p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl">
                <p className="text-white text-lg mb-8 whitespace-pre-wrap font-medium">{dialog.message}</p>
                <div className="flex justify-center gap-4">
                  {dialog.isConfirm && (
                    <button onClick={() => setDialog({ ...dialog, isOpen: false })} className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-white font-semibold transition-colors">
                      취소
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (dialog.onConfirm) dialog.onConfirm();
                      setDialog({ ...dialog, isOpen: false });
                    }}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold transition-colors">
                    확인
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<BaseballScoreboard />);
