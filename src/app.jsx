const { useState } = React;

    // doGet 템플릿에서 주입되는 현재 웹앱(/exec) URL. 결과 전송 기본값으로 사용.
    const WEB_APP_URL = "<?= webAppUrl ?>";

    // 유틸리티: 타율 계산 포맷 (예: 0.333 -> .333)
    const formatAvg = (hits, atBats) => {
      if (atBats === 0) return '.000';
      const avg = (hits / atBats).toFixed(3);
      return avg.startsWith('0.') ? avg.substring(1) : avg;
    };

    // 타순 정원 최대치(내부 버퍼). 실제 사용 인원은 팀별 awayRosterSize/homeRosterSize로 조절.
    const MAX_ROSTER = 20;

    // 유틸리티: 초기 라인업 생성 (MAX_ROSTER명 버퍼)
    // atBats/hits/rbi: 이번 경기 누계, seasonXxx: 종료된 이전 경기들의 누적(전체)
    const generateLineup = (prefix) => {
      return Array.from({ length: MAX_ROSTER }, (_, i) => ({
        id: i,
        order: i + 1,
        name: `${prefix} 타자 ${i + 1}`,
        atBats: 0,
        hits: 0,
        rbi: 0,
        seasonAtBats: 0,
        seasonHits: 0,
        seasonRbi: 0,
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

      // 병살(더블플레이) 주자 선택 모드 (true면 어느 주자를 아웃시킬지 고르는 버튼 노출)
      const [dpMode, setDpMode] = useState(false);

      // 경기 규칙 설정 (팀 설정에서 변경)
      const [maxInnings, setMaxInnings] = useState(9);
      const [outsPerInning, setOutsPerInning] = useState(3);
      // 타순(참가 인원)은 팀마다 다를 수 있어 어웨이/홈을 따로 둔다.
      const [awayRosterSize, setAwayRosterSize] = useState(9);
      const [homeRosterSize, setHomeRosterSize] = useState(9);

      // 경기 종료 여부 (강제 종료 시 true → 액션 패널 잠금)
      const [gameOver, setGameOver] = useState(false);

      // 라인업/리더보드 통계 보기 범위 ('game': 이번 경기 / 'season': 전체 누적)
      const [statView, setStatView] = useState('game');
      // 리더보드 정렬 기준 ('avg' | 'hits' | 'rbi')
      const [leaderSort, setLeaderSort] = useState('avg');
      // 현재 페이지 ('board': 스코어보드 / 'leaders': 리더보드)
      const [page, setPage] = useState('board');

      // 상태 기록 저장소 (Undo용)
      const [history, setHistory] = useState([]);

      // --- 설정(구글 시트 연동 및 수동 입력) 상태 ---
      const [isSettingsOpen, setIsSettingsOpen] = useState(false);
      const [sheetUrl, setSheetUrl] = useState('');
      const [tempAwayName, setTempAwayName] = useState('');
      const [tempHomeName, setTempHomeName] = useState('');
      const [settingsTab, setSettingsTab] = useState('manual');
      const [tempAwayLineup, setTempAwayLineup] = useState(Array(MAX_ROSTER).fill(''));
      const [tempHomeLineup, setTempHomeLineup] = useState(Array(MAX_ROSTER).fill(''));
      const [tempMaxInnings, setTempMaxInnings] = useState(9);
      const [tempOutsPerInning, setTempOutsPerInning] = useState(3);
      const [tempAwayRosterSize, setTempAwayRosterSize] = useState(9);
      const [tempHomeRosterSize, setTempHomeRosterSize] = useState(9);

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
        const size = isTop ? awayRosterSize : homeRosterSize;
        teamSetter((prev) => ({
          ...prev,
          currentBatter: (prev.currentBatter + 1) % size,
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
        if (outs + 1 >= outsPerInning) {
          // 마지막 아웃: 다음에 이 팀이 공격할 때 다음 타자부터 시작하도록 타순을 먼저 넘긴 뒤 이닝 교체
          advanceBatter();
          switchInning();
        } else {
          setOuts(outs + 1);
          advanceBatter();
        }
      };

      const updateStats = (runsScored, isHit, isAtBat, rbi = 0) => {
        const teamSetter = isTop ? setAwayTeam : setHomeTeam;

        teamSetter((prev) => {
          const newScores = [...prev.scores];
          while (newScores.length < inning) newScores.push(0);
          newScores[inning - 1] += runsScored;

          const newLineup = [...prev.lineup];
          const batter = { ...newLineup[prev.currentBatter] };
          if (isAtBat) batter.atBats += 1;
          if (isHit) batter.hits += 1;
          if (rbi) batter.rbi += rbi;
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
      // 볼넷/사구/실책 출루 등 '1루 진루권' 부여 시 강제 진루(밀어내기) 계산
      const computeForcedWalk = (b) => {
        let runsScored = 0;
        const nb = { ...b };
        if (b.first && b.second && b.third) {
          runsScored = 1;            // 만루 → 밀어내기 득점
        } else if (b.first && b.second) {
          nb.third = true;
        } else if (b.first) {
          nb.second = true;
        }
        nb.first = true;
        return { nb, runsScored };
      };

      const handleBall = () => {
        saveHistory();
        if (balls + 1 === 4) {
          const { nb, runsScored } = computeForcedWalk(bases);
          setBases(nb);
          updateStats(runsScored, false, false, runsScored); // 만루 밀어내기 득점은 타점
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
        updateStats(runsScored, true, true, runsScored); // 안타로 들어온 득점은 모두 타점
        advanceBatter();
      };

      const handleOutAction = () => {
        saveHistory();
        updateStats(0, false, true);
        addOut();
      };

      // 볼넷(직접)·사구(몸에 맞는 공): 1루 진루권 부여, 타수·안타 모두 제외
      const handleWalkLike = () => {
        saveHistory();
        const { nb, runsScored } = computeForcedWalk(bases);
        setBases(nb);
        updateStats(runsScored, false, false, runsScored); // 만루 밀어내기 득점은 타점
        advanceBatter();
      };

      // 실책 출루(ROE): 타수 포함·안타 제외, 수비팀 실책(E) +1
      const handleReachOnError = () => {
        saveHistory();
        const { nb, runsScored } = computeForcedWalk(bases);
        setBases(nb);
        updateStats(runsScored, false, true);
        const defenseSetter = isTop ? setHomeTeam : setAwayTeam;
        defenseSetter((prev) => ({ ...prev, errors: prev.errors + 1 }));
        advanceBatter();
      };

      // 야수선택(FC): 타자는 1루 출루(타수 포함·안타 제외), 다른 주자가 아웃되어 아웃 +1
      const handleFieldersChoice = () => {
        saveHistory();
        updateStats(0, false, true);
        setBases((prev) => ({ ...prev, first: true }));
        addOut();
      };

      // 희생플라이(SF): 3루 주자 태그업 득점 → 타수 제외(희생타). 득점 없으면 일반 뜬공(타수 포함)
      const handleSacFly = () => {
        saveHistory();
        const scored = bases.third;
        if (scored) setBases((prev) => ({ ...prev, third: false }));
        updateStats(scored ? 1 : 0, false, !scored, scored ? 1 : 0); // 희생플라이 득점은 타점
        addOut();
      };

      // 희생번트(SAC): 타자 아웃(타수 제외), 주자 한 베이스씩 진루(3루 주자는 득점=스퀴즈)
      const handleSacBunt = () => {
        saveHistory();
        let runsScored = 0;
        const nb = { first: false, second: false, third: false };
        if (bases.third) runsScored += 1;
        if (bases.second) nb.third = true;
        if (bases.first) nb.second = true;
        setBases(nb);
        updateStats(runsScored, false, false, runsScored); // 스퀴즈 득점은 타점
        addOut();
      };

      // 병살(더블플레이): 타자 아웃(뜬공/땅볼, 타수 포함·안타 없음) + 지정 주자 아웃 = 2아웃.
      // 예) 뜬공 포구 후 주자가 베이스를 미리 이탈해 어필로 아웃. runnerBase: 'first'|'second'|'third'
      const handleDoublePlay = (runnerBase) => {
        saveHistory();
        // 두 번째 아웃이 된 주자를 베이스에서 제거
        setBases((prev) => ({ ...prev, [runnerBase]: false }));
        // 타자: 타수 포함 아웃 처리(안타·득점 없음)
        updateStats(0, false, true);
        // 2아웃 가산 — 타순은 타자분 1회만 진루(주자 아웃은 타순과 무관)
        const newOuts = outs + 2;
        if (newOuts >= outsPerInning) {
          advanceBatter();
          switchInning();
        } else {
          setOuts(newOuts);
          advanceBatter();
        }
        setDpMode(false);
      };

      // 주자 수동 토글(도루·폭투·견제사·태그업 등 예외 상황 직접 반영)
      const toggleBase = (base) => {
        saveHistory();
        setBases((prev) => ({ ...prev, [base]: !prev[base] }));
      };

      // 수동 득점 +1 (현재 공격 팀, 현재 이닝에 가산)
      const addManualRun = () => {
        saveHistory();
        updateStats(1, false, false);
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

      // 경기 강제 종료: 현재 기록을 확정(잠금)하고 결과 저장 모달을 연다.
      // 이번 경기 기록은 [새 경기]를 누르기 전까지 화면에 그대로 유지된다.
      const endGame = () => {
        if (gameOver) { setIsExportOpen(true); return; }
        showConfirm(
          "현재 경기를 종료하고 결과를 저장하시겠습니까?\n종료하면 액션 패널이 잠기며, [새 경기]를 누르면 이번 기록이 전체(누적)에 반영됩니다.",
          () => {
            setGameOver(true);
            setIsExportOpen(true);
          }
        );
      };

      // 경기 종료(저장 안 함): 결과를 시트에 보내지 않고 기록만 화면에 남긴 채 종료(잠금).
      // 친선·연습 경기 등 시트 누적이 필요 없을 때 사용. 종료 후에도 [📤 결과 저장]으로 수동 저장은 가능.
      const endGameWithoutSave = () => {
        if (gameOver) return;
        showConfirm(
          "결과를 구글 시트에 저장하지 않고 경기를 종료할까요?\n액션 패널이 잠기며, 필요하면 나중에 [📤 결과 저장]으로 직접 보낼 수 있습니다.",
          () => setGameOver(true)
        );
      };

      // 새 경기 시작: 이번 경기 기록을 전체(누적: seasonXxx)에 합산한 뒤 경기 상태를 초기화.
      const startNewGame = () => {
        const foldTeam = (prev) => ({
          ...prev,
          scores: Array(maxInnings).fill(0),
          runs: 0,
          hits: 0,
          errors: 0,
          currentBatter: 0,
          lineup: prev.lineup.map((b) => ({
            ...b,
            seasonAtBats: b.seasonAtBats + b.atBats,
            seasonHits: b.seasonHits + b.hits,
            seasonRbi: b.seasonRbi + b.rbi,
            atBats: 0,
            hits: 0,
            rbi: 0,
          })),
        });
        setInning(1);
        setIsTop(true);
        setBalls(0);
        setStrikes(0);
        setOuts(0);
        setBases({ first: false, second: false, third: false });
        setAwayTeam(foldTeam);
        setHomeTeam(foldTeam);
        setHistory([]);
        setGameOver(false);
      };

      const resetGame = () => {
        showConfirm(
          "이번 경기 기록을 전체(누적)에 반영하고 새 경기를 시작할까요?",
          startNewGame
        );
      };

      // --- 명단 및 설정 처리 로직 ---
      const openSettings = () => {
        setTempAwayName(awayTeam.name);
        setTempHomeName(homeTeam.name);
        // 기본 자동 이름(예: "어웨이 타자 1")은 빈 칸으로 두고 placeholder로만 노출 → 클릭 시 바로 입력
        setTempAwayLineup(awayTeam.lineup.map((b, i) => b.name === `어웨이 타자 ${i + 1}` ? '' : b.name));
        setTempHomeLineup(homeTeam.lineup.map((b, i) => b.name === `홈 타자 ${i + 1}` ? '' : b.name));
        setTempMaxInnings(maxInnings);
        setTempOutsPerInning(outsPerInning);
        setTempAwayRosterSize(awayRosterSize);
        setTempHomeRosterSize(homeRosterSize);
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

              const batter = { id: order - 1, order, name: name.trim(), atBats: 0, hits: 0, rbi: 0, seasonAtBats: 0, seasonHits: 0, seasonRbi: 0 };

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

        // 경기 규칙(이닝 수 / 아웃 카운트 / 팀별 타자 수) 적용 — 범위 보정
        const safeInnings = Math.min(30, Math.max(1, parseInt(tempMaxInnings, 10) || 9));
        const safeOuts = Math.min(10, Math.max(1, parseInt(tempOutsPerInning, 10) || 3));
        const safeAwayRoster = Math.min(MAX_ROSTER, Math.max(1, parseInt(tempAwayRosterSize, 10) || 9));
        const safeHomeRoster = Math.min(MAX_ROSTER, Math.max(1, parseInt(tempHomeRosterSize, 10) || 9));
        setMaxInnings(safeInnings);
        setOutsPerInning(safeOuts);
        setAwayRosterSize(safeAwayRoster);
        setHomeRosterSize(safeHomeRoster);

        // 타자 수가 줄어든 경우 현재 타순이 범위를 벗어나지 않도록 보정(팀별)
        setAwayTeam(prev => ({ ...prev, name: tempAwayName || 'AWAY', lineup: parsedAwayLineup, currentBatter: prev.currentBatter % safeAwayRoster }));
        setHomeTeam(prev => ({ ...prev, name: tempHomeName || 'HOME', lineup: parsedHomeLineup, currentBatter: prev.currentBatter % safeHomeRoster }));
        setIsSettingsOpen(false);
      };

      // 명단 편집: 팀별 타순 한 줄 추가(빈 자리). 최대 MAX_ROSTER명까지.
      // team: 'away' | 'home'
      const addBatterRow = (team) => {
        const [size, setSize] = team === 'away'
          ? [tempAwayRosterSize, setTempAwayRosterSize]
          : [tempHomeRosterSize, setTempHomeRosterSize];
        const n = Math.max(1, Math.min(MAX_ROSTER, parseInt(size, 10) || 9));
        if (n >= MAX_ROSTER) return;
        setSize(n + 1);
      };

      // 명단 편집: 해당 팀의 idx번째 타순만 삭제 → 그 팀 타순이 한 칸씩 당겨지고 인원 -1.
      // 양팀 인원이 달라도 되도록 팀별로 독립 처리. 버퍼 길이(MAX_ROSTER)는 끝에 빈 칸으로 유지.
      const removeBatterRow = (team, idx) => {
        const [size, setSize, setLineup] = team === 'away'
          ? [tempAwayRosterSize, setTempAwayRosterSize, setTempAwayLineup]
          : [tempHomeRosterSize, setTempHomeRosterSize, setTempHomeLineup];
        const n = Math.max(1, Math.min(MAX_ROSTER, parseInt(size, 10) || 9));
        if (n <= 1) return;
        setLineup((arr) => {
          const next = arr.filter((_, i) => i !== idx);
          next.push('');
          return next;
        });
        setSize(n - 1);
      };

      // --- 결과 내보내기(저장) 로직 ---
      const handleExportCSV = () => {
        const nCols = Math.max(maxInnings, awayTeam.scores.length, homeTeam.scores.length);
        const inningHeader = Array.from({ length: nCols }, (_, i) => i + 1).join(',');
        const scoreCells = (t) => Array.from({ length: nCols }, (_, i) => t.scores[i] || 0).join(',');

        let csvContent = "data:text/csv;charset=utf-8,﻿";
        csvContent += `구분,${inningHeader},R,H,E\n`;
        csvContent += `${awayTeam.name},${scoreCells(awayTeam)},${awayTeam.runs},${awayTeam.hits},${awayTeam.errors}\n`;
        csvContent += `${homeTeam.name},${scoreCells(homeTeam)},${homeTeam.runs},${homeTeam.hits},${homeTeam.errors}\n\n`;

        csvContent += "팀,타순,이름,타수,안타,타율,타점\n";
        awayTeam.lineup.slice(0, awayRosterSize).forEach(b => {
          csvContent += `${awayTeam.name},${b.order},${b.name},${b.atBats},${b.hits},${formatAvg(b.hits, b.atBats)},${b.rbi}\n`;
        });
        homeTeam.lineup.slice(0, homeRosterSize).forEach(b => {
          csvContent += `${homeTeam.name},${b.order},${b.name},${b.atBats},${b.hits},${formatAvg(b.hits, b.atBats)},${b.rbi}\n`;
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
        const url = (webhookUrl || '').trim();
        if (!url) {
          showMessage('웹앱 URL을 입력해주세요.');
          return;
        }
        // 미치환 템플릿 플레이스홀더 감지: 정적 호스팅(테스트 서버 등)에서 doGet 템플릿이
        // 실행되지 않아 "<?= webAppUrl ?>"가 그대로 남은 경우. 이 상태로 보내면
        // no-cors라 실패해도 거짓 "전송 완료"가 떠서 시트에 저장되지 않는다.
        if (url.indexOf('<?=') !== -1 || url.indexOf('?>') !== -1) {
          showMessage('이 화면은 배포된 웹앱이 아니라 미리보기(정적) 버전이라 전송 URL이 비어 있습니다.\n배포된 /exec 주소(예: https://script.google.com/macros/s/.../exec)로 접속해 저장하세요.');
          return;
        }
        // 정상적인 Apps Script 웹앱 /exec 주소인지 확인
        if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(url)) {
          showMessage('올바른 웹앱 주소가 아닙니다.\nhttps://script.google.com/macros/s/.../exec 형식의 배포 주소를 입력하세요.');
          return;
        }
        const payload = {
          date: new Date().toLocaleString(),
          awayTeam: { name: awayTeam.name, runs: awayTeam.runs, hits: awayTeam.hits, scores: awayTeam.scores, lineup: awayTeam.lineup.slice(0, awayRosterSize) },
          homeTeam: { name: homeTeam.name, runs: homeTeam.runs, hits: homeTeam.hits, scores: homeTeam.scores, lineup: homeTeam.lineup.slice(0, homeRosterSize) }
        };
        try {
          await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          // no-cors 응답은 불투명(opaque)이라 실제 저장 성공 여부를 읽을 수 없다.
          // 거짓 확신을 주지 않도록 "요청을 보냈다 + 시트에서 확인" 문구로 안내.
          showMessage('전송 요청을 보냈습니다.\n실제 저장 여부는 구글 시트에서 확인하세요. (보안 정책상 앱에서 저장 성공을 직접 확인할 수 없습니다.)');
          setIsExportOpen(false);
        } catch (e) {
          showMessage('전송 중 오류가 발생했습니다. URL과 네트워크 상태를 확인해주세요.');
        }
      };

      // --- UI 렌더링 ---
      const displayInnings = Math.max(maxInnings, inning);
      const inningColumns = Array.from({ length: displayInnings }, (_, i) => i + 1);

      // 명단 편집기에 표시할 팀별 참가 인원 수 (문자열 입력 방어)
      const editAwayCount = Math.max(1, Math.min(MAX_ROSTER, parseInt(tempAwayRosterSize, 10) || 9));
      const editHomeCount = Math.max(1, Math.min(MAX_ROSTER, parseInt(tempHomeRosterSize, 10) || 9));

      // 라인업/리더보드용 통계 계산 (statView에 따라 이번 경기 또는 전체 누적)
      const viewStat = (b) => statView === 'season'
        ? { ab: b.seasonAtBats + b.atBats, h: b.seasonHits + b.hits, r: b.seasonRbi + b.rbi }
        : { ab: b.atBats, h: b.hits, r: b.rbi };

      // 리더보드: 양 팀 선수를 합쳐 정렬
      const leaderboard = [
        ...awayTeam.lineup.slice(0, awayRosterSize).map((b) => ({ ...viewStat(b), name: b.name, team: awayTeam.name, side: 'away' })),
        ...homeTeam.lineup.slice(0, homeRosterSize).map((b) => ({ ...viewStat(b), name: b.name, team: homeTeam.name, side: 'home' })),
      ]
        .filter((p) => p.ab > 0 || p.h > 0 || p.r > 0)
        .sort((a, b) => {
          if (leaderSort === 'hits') return b.h - a.h || b.r - a.r;
          if (leaderSort === 'rbi') return b.r - a.r || b.h - a.h;
          // 타율: 규정타석 개념이 없으므로 타수 0은 뒤로
          const avgA = a.ab > 0 ? a.h / a.ab : -1;
          const avgB = b.ab > 0 ? b.h / b.ab : -1;
          return avgB - avgA || b.h - a.h;
        });

      // 라인업 기록 카드(좌:어웨이 / 우:홈 사이드 레일에 사용). size: 해당 팀 참가 인원
      const renderLineupCard = (team, accent, size) => (
        <div className="bg-gray-800 p-4 rounded-2xl border border-gray-700">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className={`font-bold text-sm ${accent}`}>{team.name}</h3>
            <div className="flex gap-1 bg-gray-900 p-0.5 rounded-lg">
              <button onClick={() => setStatView('game')} className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${statView === 'game' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>이번</button>
              <button onClick={() => setStatView('season')} className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${statView === 'season' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>누적</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-1.5 px-1 font-semibold">#</th>
                  <th className="text-left py-1.5 px-1 font-semibold">이름</th>
                  <th className="py-1.5 px-1 font-semibold">타수</th>
                  <th className="py-1.5 px-1 font-semibold">안타</th>
                  <th className="py-1.5 px-1 font-semibold text-yellow-400">타율</th>
                  <th className="py-1.5 px-1 font-semibold text-yellow-400">타점</th>
                </tr>
              </thead>
              <tbody>
                {team.lineup.slice(0, size).map((b) => {
                  const s = viewStat(b);
                  const isNow = !gameOver && team === currentTeam && b.id === currentBatter.id;
                  return (
                    <tr key={b.id} className={`border-b border-gray-800 ${isNow ? 'bg-yellow-500/10' : ''}`}>
                      <td className="py-1.5 px-1 text-gray-500">{b.order}</td>
                      <td className="py-1.5 px-1 text-left truncate max-w-[6rem]">{isNow && '▶ '}{b.name}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{s.ab}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{s.h}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-white">{formatAvg(s.h, s.ab)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-white">{s.r}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );

      return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-8 select-none relative">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* 페이지 네비게이션 */}
            <div className="flex gap-2 bg-gray-800 p-2 rounded-2xl border border-gray-700">
              <button onClick={() => setPage('board')} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${page === 'board' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>📋 스코어보드</button>
              <button onClick={() => setPage('leaders')} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${page === 'leaders' ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>🏆 리더보드</button>
            </div>

            {page === 'board' && (
            <div className="flex flex-col xl:flex-row gap-6 items-start">

            {/* 왼쪽: 어웨이 라인업 */}
            <div className="w-full xl:w-72 shrink-0 order-2 xl:order-1">
              {renderLineupCard(awayTeam, 'text-blue-400', awayRosterSize)}
            </div>

            {/* 가운데: 스코어보드 + 컨트롤 */}
            <div className="flex-1 min-w-0 w-full space-y-6 order-1 xl:order-2">
            {/* 헤더 및 스코어보드 테이블 */}
            <div className="bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-xl border border-gray-700">
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h1 className="text-2xl sm:text-3xl font-bold text-yellow-400 leading-tight">BASEBALL SCOREBOARD</h1>
                  <div className="text-lg font-bold text-right whitespace-nowrap shrink-0">
                    {gameOver
                      ? <span className="text-red-400">경기 종료</span>
                      : <>{inning}회 {isTop ? '초' : '말'} <span className="text-gray-500 text-sm">/ {maxInnings}회</span></>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button onClick={endGame} className="px-2 py-2 rounded-lg text-sm font-semibold text-center transition-colors bg-red-800 hover:bg-red-700 border border-red-600">
                    🏁 종료·저장
                  </button>
                  <button onClick={endGameWithoutSave} className="px-2 py-2 rounded-lg text-sm font-semibold text-center transition-colors bg-gray-700 hover:bg-gray-600 border border-gray-500">
                    🚫 저장 없이 종료
                  </button>
                  <button onClick={() => setIsExportOpen(true)} className="px-2 py-2 rounded-lg text-sm font-semibold text-center transition-colors bg-green-700 hover:bg-green-600 border border-green-600">
                    📤 결과 저장
                  </button>
                  <button onClick={openSettings} className="px-2 py-2 rounded-lg text-sm font-semibold text-center transition-colors bg-gray-700 hover:bg-gray-600 border border-gray-600">
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
              <div className="bg-gray-800 p-5 rounded-2xl flex flex-col justify-center border border-gray-700">
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
                    <div className="flex flex-wrap gap-3">
                      {Array.from({ length: Math.max(1, outsPerInning - 1) }, (_, i) => i).map((i) => (
                        <div key={i} className={`w-8 h-8 rounded-full border-2 border-gray-600 ${i < outs ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. 다이아몬드 (베이스 상태) */}
              <div className="bg-gray-800 p-5 rounded-2xl flex items-center justify-center border border-gray-700">
                <div className="relative w-36 h-36">
                  {/* 내야 연결선 (다이아몬드) */}
                  <div className="absolute left-1/2 top-1/2 w-[6.4rem] h-[6.4rem] -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-gray-600 rounded-sm"></div>
                  {/* 2루 (상단) */}
                  <div className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rotate-45 rounded-sm ${bases.second ? 'bg-yellow-400 shadow-[0_0_15px_#facc15]' : 'bg-gray-700 border-2 border-gray-500'}`}></div>
                  {/* 3루 (좌측) */}
                  <div className={`absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rotate-45 rounded-sm ${bases.third ? 'bg-yellow-400 shadow-[0_0_15px_#facc15]' : 'bg-gray-700 border-2 border-gray-500'}`}></div>
                  {/* 1루 (우측) */}
                  <div className={`absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-8 h-8 rotate-45 rounded-sm ${bases.first ? 'bg-yellow-400 shadow-[0_0_15px_#facc15]' : 'bg-gray-700 border-2 border-gray-500'}`}></div>
                  {/* 홈 플레이트 (하단, 오각형) */}
                  <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-8 h-8" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.7))' }}>
                    <div className="w-full h-full bg-white" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 55%, 50% 100%, 0% 55%)' }}></div>
                  </div>
                </div>
              </div>

              {/* 3. 현재 타자 정보 */}
              <div className="bg-gray-800 p-5 rounded-2xl flex flex-col justify-between border border-gray-700">
                <div>
                  <div className="text-xs text-gray-400 mb-1 font-semibold tracking-wider">NOW BATTING</div>
                  <div className="text-yellow-400 font-bold text-lg mb-3">
                    {currentTeam.name}
                  </div>
                  <div className="flex items-baseline gap-2 mb-1 min-w-0">
                    <span className="text-3xl font-black text-white whitespace-nowrap">{currentBatter.order}번</span>
                    <span className="text-base text-gray-200 truncate min-w-0">{currentBatter.name}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-5">
                  <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-700 text-center">
                    <div className="text-[10px] text-gray-500 mb-1 leading-tight">AVG<br/>(타율)</div>
                    <div className="text-2xl font-mono text-white">{formatAvg(currentBatter.hits, currentBatter.atBats)}</div>
                  </div>
                  <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-700 text-center">
                    <div className="text-[10px] text-gray-500 mb-1 leading-tight">H / AB<br/>(안타/타수)</div>
                    <div className="text-xl font-mono text-gray-300 whitespace-nowrap">{currentBatter.hits} / {currentBatter.atBats}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 컨트롤 패널 */}
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-400 font-semibold tracking-wider">ACTION PANEL</div>
                {gameOver && (
                  <button onClick={resetGame} className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">
                    ＋ 새 경기
                  </button>
                )}
              </div>

              {gameOver && (
                <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-xl text-sm font-medium">
                  🏁 경기가 종료되었습니다. 기록은 [📤 결과 저장]으로 저장하고, [＋ 새 경기]를 누르면 이번 기록이 전체(누적)에 반영됩니다.
                </div>
              )}

              <div className={gameOver ? 'opacity-40 pointer-events-none' : ''}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="flex flex-col gap-2">
                  <button onClick={handleBall} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-green-900/50 hover:bg-green-800 text-green-400 font-bold rounded-xl border border-green-700 transition-colors">볼 (Ball)</button>
                  <button onClick={handleStrike} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-yellow-900/50 hover:bg-yellow-800 text-yellow-400 font-bold rounded-xl border border-yellow-700 transition-colors">스트라이크 (Strike)</button>
                  <button onClick={handleFoul} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded-xl border border-gray-500 transition-colors">파울 (Foul)</button>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => handleHit(1)} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-blue-900/50 hover:bg-blue-800 text-blue-400 font-bold rounded-xl border border-blue-700 transition-colors">1루타 (1B)</button>
                  <button onClick={() => handleHit(2)} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-blue-900/50 hover:bg-blue-800 text-blue-400 font-bold rounded-xl border border-blue-700 transition-colors">2루타 (2B)</button>
                  <button onClick={() => handleHit(3)} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-blue-900/50 hover:bg-blue-800 text-blue-400 font-bold rounded-xl border border-blue-700 transition-colors">3루타 (3B)</button>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => handleHit(4)} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-purple-900/50 hover:bg-purple-800 text-purple-400 font-bold rounded-xl border border-purple-700 transition-colors">홈런 (HR)</button>
                  <button onClick={handleOutAction} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-red-900/50 hover:bg-red-800 text-red-400 font-bold rounded-xl border border-red-700 transition-colors">타격 아웃 (Out)</button>
                </div>

                <div className="flex flex-col gap-2">
                   <button
                     onClick={handleUndo}
                     disabled={history.length === 0}
                     className={`min-h-[3.5rem] flex items-center justify-center text-center px-3 font-bold rounded-xl border transition-colors ${
                       history.length === 0
                         ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                         : 'bg-orange-900/50 hover:bg-orange-800 text-orange-400 border-orange-700'
                     }`}>
                     되돌리기 (Undo)
                   </button>
                   <button onClick={resetGame} className="min-h-[3.5rem] flex items-center justify-center text-center px-3 bg-gray-900 hover:bg-black text-gray-500 font-bold rounded-xl border border-gray-800 transition-colors">새 경기 (초기화)</button>
                </div>
              </div>

              {/* 특수 상황 (SPECIAL) */}
              <div className="mt-6 pt-5 border-t border-gray-700">
                <div className="text-sm text-gray-400 mb-3 font-semibold tracking-wider">특수 상황 (SPECIAL)</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <button onClick={handleWalkLike} className="py-3 px-3 bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 font-bold rounded-xl border border-emerald-700 transition-colors text-sm">볼넷 (BB)</button>
                  <button onClick={handleWalkLike} className="py-3 px-3 bg-teal-900/50 hover:bg-teal-800 text-teal-300 font-bold rounded-xl border border-teal-700 transition-colors text-sm">사구 (HBP)</button>
                  <button onClick={handleFieldersChoice} className="py-3 px-3 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 font-bold rounded-xl border border-indigo-700 transition-colors text-sm">야수선택 (FC)</button>
                  <button onClick={handleReachOnError} className="py-3 px-3 bg-rose-900/50 hover:bg-rose-800 text-rose-300 font-bold rounded-xl border border-rose-700 transition-colors text-sm">실책 출루 (ROE)</button>
                  <button onClick={handleSacFly} className="py-3 px-3 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 font-bold rounded-xl border border-cyan-700 transition-colors text-sm">희생플라이 (SF)</button>
                  <button onClick={handleSacBunt} className="py-3 px-3 bg-sky-900/50 hover:bg-sky-800 text-sky-300 font-bold rounded-xl border border-sky-700 transition-colors text-sm">희생번트 (SAC)</button>
                  {(() => {
                    const hasRunner = bases.first || bases.second || bases.third;
                    return (
                      <button
                        onClick={() => setDpMode((v) => !v)}
                        disabled={!hasRunner && !dpMode}
                        className={`py-3 px-3 font-bold rounded-xl border transition-colors text-sm ${
                          !hasRunner && !dpMode
                            ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                            : dpMode
                            ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_#9333ea]'
                            : 'bg-purple-900/50 hover:bg-purple-800 text-purple-300 border-purple-700'
                        }`}>
                        병살 (DP)
                      </button>
                    );
                  })()}
                </div>
                {dpMode && (
                  <div className="mt-3 p-3 bg-purple-950/40 rounded-xl border border-purple-800">
                    <div className="text-xs text-purple-300 mb-2 font-semibold">병살 — 타자는 뜬공/땅볼 아웃, 두 번째로 아웃된 주자를 선택하세요</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {bases.first && <button onClick={() => handleDoublePlay('first')} className="py-2.5 px-3 bg-purple-800 hover:bg-purple-700 text-purple-100 font-bold rounded-lg border border-purple-600 transition-colors text-sm">1루 주자 아웃</button>}
                      {bases.second && <button onClick={() => handleDoublePlay('second')} className="py-2.5 px-3 bg-purple-800 hover:bg-purple-700 text-purple-100 font-bold rounded-lg border border-purple-600 transition-colors text-sm">2루 주자 아웃</button>}
                      {bases.third && <button onClick={() => handleDoublePlay('third')} className="py-2.5 px-3 bg-purple-800 hover:bg-purple-700 text-purple-100 font-bold rounded-lg border border-purple-600 transition-colors text-sm">3루 주자 아웃</button>}
                      <button onClick={() => setDpMode(false)} className="py-2.5 px-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded-lg border border-gray-500 transition-colors text-sm">취소</button>
                    </div>
                  </div>
                )}
              </div>

              {/* 주자 / 득점 수동 조정 (RUNNERS) */}
              <div className="mt-5 pt-5 border-t border-gray-700">
                <div className="text-sm text-gray-400 mb-3 font-semibold tracking-wider">주자 / 득점 수동 조정 (RUNNERS)</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button onClick={() => toggleBase('first')} className={`py-3 px-3 font-bold rounded-xl border transition-colors text-sm ${bases.first ? 'bg-yellow-500 text-gray-900 border-yellow-400 shadow-[0_0_10px_#eab308]' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-500'}`}>1루 주자</button>
                  <button onClick={() => toggleBase('second')} className={`py-3 px-3 font-bold rounded-xl border transition-colors text-sm ${bases.second ? 'bg-yellow-500 text-gray-900 border-yellow-400 shadow-[0_0_10px_#eab308]' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-500'}`}>2루 주자</button>
                  <button onClick={() => toggleBase('third')} className={`py-3 px-3 font-bold rounded-xl border transition-colors text-sm ${bases.third ? 'bg-yellow-500 text-gray-900 border-yellow-400 shadow-[0_0_10px_#eab308]' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-500'}`}>3루 주자</button>
                  <button onClick={addManualRun} className="py-3 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl border border-amber-500 transition-colors text-sm">득점 +1</button>
                </div>
                <p className="text-xs text-gray-500 mt-3 leading-relaxed">💡 도루·폭투·견제사·태그업 등은 베이스 주자를 직접 켜고/끄고, 득점이 나면 [득점 +1]로 반영하세요. 모든 동작은 되돌리기(Undo)로 취소됩니다.</p>
              </div>
              </div>
            </div>

            </div>
            {/* 가운데 컬럼 끝 */}

            {/* 오른쪽: 홈 라인업 */}
            <div className="w-full xl:w-72 shrink-0 order-3">
              {renderLineupCard(homeTeam, 'text-red-400', homeRosterSize)}
            </div>

            </div>
            )}

            {page === 'leaders' && (
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <div>
                  <h1 className="text-2xl font-bold text-yellow-400">🏆 리더보드</h1>
                  <p className="text-xs text-gray-400 mt-1">{statView === 'season' ? '전체 누적 기록' : '이번 경기 기록'} · 양 팀 타자 순위</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 bg-gray-900 p-1 rounded-lg">
                    <button onClick={() => setStatView('game')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${statView === 'game' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>이번 경기</button>
                    <button onClick={() => setStatView('season')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${statView === 'season' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>전체 누적</button>
                  </div>
                  <div className="flex gap-1 bg-gray-900 p-1 rounded-lg">
                    <button onClick={() => setLeaderSort('avg')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${leaderSort === 'avg' ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-white'}`}>타율순</button>
                    <button onClick={() => setLeaderSort('hits')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${leaderSort === 'hits' ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-white'}`}>안타순</button>
                    <button onClick={() => setLeaderSort('rbi')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${leaderSort === 'rbi' ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-white'}`}>타점순</button>
                  </div>
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">아직 기록이 없습니다. 경기를 진행하면 순위가 표시됩니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="py-1.5 px-2 font-semibold">순위</th>
                        <th className="text-left py-1.5 px-2 font-semibold">이름</th>
                        <th className="text-left py-1.5 px-2 font-semibold">팀</th>
                        <th className="py-1.5 px-2 font-semibold">타수</th>
                        <th className="py-1.5 px-2 font-semibold">안타</th>
                        <th className={`py-1.5 px-2 font-semibold ${leaderSort === 'avg' ? 'text-yellow-400' : ''}`}>타율</th>
                        <th className={`py-1.5 px-2 font-semibold ${leaderSort === 'rbi' ? 'text-yellow-400' : ''}`}>타점</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((p, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="py-1.5 px-2 text-center font-bold text-gray-400">{i + 1}</td>
                          <td className="py-1.5 px-2 text-left truncate max-w-[8rem]">{p.name}</td>
                          <td className={`py-1.5 px-2 text-left text-xs ${p.side === 'away' ? 'text-blue-400' : 'text-red-400'}`}>{p.team}</td>
                          <td className="py-1.5 px-2 text-center font-mono text-gray-300">{p.ab}</td>
                          <td className={`py-1.5 px-2 text-center font-mono ${leaderSort === 'hits' ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{p.h}</td>
                          <td className={`py-1.5 px-2 text-center font-mono ${leaderSort === 'avg' ? 'text-yellow-300 font-bold' : 'text-white'}`}>{formatAvg(p.h, p.ab)}</td>
                          <td className={`py-1.5 px-2 text-center font-mono ${leaderSort === 'rbi' ? 'text-yellow-300 font-bold' : 'text-white'}`}>{p.r}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

          </div>

          {/* 설정 모달 (명단 연동 및 수동 입력) */}
          {isSettingsOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl border border-gray-700 w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
                <h2 className="text-2xl font-bold text-white mb-4">팀 설정 및 명단 관리</h2>

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

                  {/* 경기 규칙 설정 */}
                  <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                    <h3 className="text-sm font-bold text-gray-300 mb-3">경기 규칙</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">정규 이닝 수</label>
                        <input type="number" min="1" max="30" value={tempMaxInnings} onChange={(e) => setTempMaxInnings(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">이닝당 아웃</label>
                        <input type="number" min="1" max="10" value={tempOutsPerInning} onChange={(e) => setTempOutsPerInning(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">기본값: 9이닝 · 3아웃. 경기 진행 중에도 변경할 수 있습니다. 팀별 참가 인원(타순)은 아래 <b className="text-gray-300">수동 입력</b> 탭에서 ✕/＋로 조정하세요. (팀당 최대 {MAX_ROSTER}명)</p>
                  </div>

                  {settingsTab === 'manual' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                      {[
                        { key: 'away', label: '어웨이 (AWAY)', accent: 'text-blue-400', focus: 'focus:border-blue-500', names: tempAwayLineup, setNames: setTempAwayLineup, count: editAwayCount, ph: '어웨이' },
                        { key: 'home', label: '홈 (HOME)', accent: 'text-red-400', focus: 'focus:border-red-500', names: tempHomeLineup, setNames: setTempHomeLineup, count: editHomeCount, ph: '홈' },
                      ].map((t) => (
                        <div key={t.key}>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className={`font-bold text-sm ${t.accent}`}>{t.label}</h3>
                            <span className="text-xs text-gray-400">참가 인원: <b className="text-white">{t.count}</b>명</span>
                          </div>
                          <div className="space-y-2">
                            {Array.from({ length: t.count }, (_, i) => (
                              <div key={`${t.key}-${i}`} className="flex items-center gap-2">
                                <span className="w-6 text-center text-gray-400 text-sm font-bold shrink-0">{i + 1}</span>
                                <input
                                  type="text"
                                  value={t.names[i] || ''}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const newArr = [...t.names];
                                    newArr[i] = e.target.value;
                                    t.setNames(newArr);
                                  }}
                                  className={`flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none ${t.focus}`}
                                  placeholder={`${t.ph} 타자 ${i + 1}`}
                                />
                                <button
                                  onClick={() => removeBatterRow(t.key, i)}
                                  disabled={t.count <= 1}
                                  title="이 타순 삭제"
                                  className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                                    t.count <= 1
                                      ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                                      : 'bg-red-900/40 hover:bg-red-800 text-red-300 border-red-700'
                                  }`}>
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => addBatterRow(t.key)}
                            disabled={t.count >= MAX_ROSTER}
                            className={`mt-3 w-full py-2 rounded-lg border text-sm font-bold transition-colors ${
                              t.count >= MAX_ROSTER
                                ? 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed'
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-500'
                            }`}>
                            ＋ 타자 추가
                          </button>
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 sm:col-span-2 -mt-2">✕ 버튼으로 빈 자리나 불참 선수를 삭제하면 그 팀 타순이 한 칸씩 당겨지고 참가 인원이 줄어듭니다. <b className="text-gray-300">어웨이·홈 인원은 서로 다르게</b> 설정할 수 있습니다. (팀당 최소 1명 · 최대 {MAX_ROSTER}명)</p>
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
