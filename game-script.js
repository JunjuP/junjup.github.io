(function () {
    const canvas = document.getElementById("hero-mini-game-canvas");
    const resetButton = document.getElementById("hero-mini-game-reset");
    if (!canvas || !resetButton) {
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }

    const groundY = canvas.height - 56;
    const horizonY = groundY - 72;
    const centerX = canvas.width * 0.5;
    const nearRoadHalfWidth = canvas.width * 0.42;
    const farRoadHalfWidth = 10;
    const carWidth = 40;
    const carHeight = 52;
    const baseSpeed = 300;
    const baseApproachRate = 0.5;
    const steerAccel = 3.6;
    const maxLaneSpeed = 2.15;
    const steerFriction = 5.5;
    const laneLimit = 0.92;

    const state = {
        running: true,
        started: false,
        playerLane: 0,
        laneVelocity: 0,
        steerKeyDir: 0,
        steerPointerDir: 0,
        speed: baseSpeed,
        distance: 0,
        score: 0,
        obstacles: [],
        spawnTimer: 0,
        nextSpawnIn: 0,
        lastTs: null
    };

    const heldKeys = new Set();

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function laneWidthAt(t) {
        return farRoadHalfWidth + (nearRoadHalfWidth - farRoadHalfWidth) * t;
    }

    function laneXAt(lane, t) {
        return centerX + lane * laneWidthAt(t);
    }

    function yAt(t) {
        return horizonY + t * t * (groundY - horizonY);
    }

    function obstacleWidthAt(t) {
        return 8 + (46 - 8) * t;
    }

    function obstacleHeightAt(t) {
        return 10 + (54 - 10) * t;
    }

    function scheduleNextSpawn() {
        const difficultyFactor = Math.max(0.5, 1 - state.distance / 18000);
        state.nextSpawnIn = randomRange(0.65, 2.6) * difficultyFactor;
    }

    function resetGame() {
        state.running = true;
        state.started = false;
        state.playerLane = 0;
        state.laneVelocity = 0;
        state.speed = baseSpeed;
        state.distance = 0;
        state.score = 0;
        state.obstacles = [];
        state.spawnTimer = 0;
        state.lastTs = null;
        scheduleNextSpawn();
        requestAnimationFrame(loop);
    }

    function applyStartOrRestart() {
        if (!state.running) {
            resetGame();
            return true;
        }
        if (!state.started) {
            state.started = true;
        }
        return false;
    }

    function recalcKeySteer() {
        if (heldKeys.has("left") && !heldKeys.has("right")) {
            state.steerKeyDir = -1;
        } else if (heldKeys.has("right") && !heldKeys.has("left")) {
            state.steerKeyDir = 1;
        } else {
            state.steerKeyDir = 0;
        }
    }

    function spawnObstacle() {
        const candidateLanes = [-0.68, 0, 0.68];
        const count = Math.random() < 0.25 ? 2 : 1;
        const shuffled = candidateLanes.slice().sort(function () {
            return Math.random() - 0.5;
        });

        for (let i = 0; i < count; i += 1) {
            const lane = clamp(shuffled[i] + randomRange(-0.12, 0.12), -0.85, 0.85);
            state.obstacles.push({
                lane: lane,
                t: 0,
                shade: Math.random() < 0.5
            });
        }
    }

    function updateSteering(dt) {
        const effectiveDir = state.steerKeyDir !== 0 ? state.steerKeyDir : state.steerPointerDir;

        if (effectiveDir !== 0) {
            state.laneVelocity += effectiveDir * steerAccel * dt;
        } else {
            const damping = Math.max(0, 1 - steerFriction * dt);
            state.laneVelocity *= damping;
        }

        state.laneVelocity = clamp(state.laneVelocity, -maxLaneSpeed, maxLaneSpeed);
        state.playerLane += state.laneVelocity * dt;

        if (state.playerLane > laneLimit) {
            state.playerLane = laneLimit;
            state.laneVelocity = Math.min(state.laneVelocity, 0);
        } else if (state.playerLane < -laneLimit) {
            state.playerLane = -laneLimit;
            state.laneVelocity = Math.max(state.laneVelocity, 0);
        }
    }

    function updateObstacles(dt) {
        state.spawnTimer += dt;
        if (state.spawnTimer >= state.nextSpawnIn) {
            state.spawnTimer = 0;
            scheduleNextSpawn();
            spawnObstacle();
        }

        const approachRate = baseApproachRate * (state.speed / baseSpeed);

        for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
            const obstacle = state.obstacles[i];
            obstacle.t += dt * approachRate;
            if (obstacle.t > 1.08) {
                state.obstacles.splice(i, 1);
            }
        }
    }

    function detectCollision() {
        const playerCenterX = laneXAt(state.playerLane, 1);
        const playerHalf = carWidth / 2;

        for (let i = 0; i < state.obstacles.length; i += 1) {
            const obstacle = state.obstacles[i];
            if (obstacle.t < 0.88 || obstacle.t > 1.05) {
                continue;
            }

            const t = Math.min(obstacle.t, 1);
            const obstacleCenterX = laneXAt(obstacle.lane, t);
            const obstacleHalf = obstacleWidthAt(t) / 2;

            if (Math.abs(obstacleCenterX - playerCenterX) < obstacleHalf + playerHalf - 4) {
                state.running = false;
            }
        }
    }

    function drawBackground() {
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, "#130d12");
        sky.addColorStop(0.55, "#271217");
        sky.addColorStop(1, "#1f140f");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "rgba(255, 136, 72, 0.72)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(canvas.width, horizonY);
        ctx.stroke();

        const travel = state.started ? state.distance : 0;
        const speedRatio = state.speed / baseSpeed;
        const depthTravel = (travel * 0.42 * speedRatio) % 78;

        ctx.strokeStyle = "rgba(255, 133, 68, 0.22)";
        ctx.lineWidth = 1;

        for (let i = -8; i <= 8; i += 1) {
            const bottomX = centerX + i * 74;
            const topX = centerX + i * 10;
            const bowX = centerX + (bottomX - centerX) * 0.42;
            const bowY = horizonY + (canvas.height - horizonY) * 0.55;
            ctx.beginPath();
            ctx.moveTo(bottomX, canvas.height);
            ctx.quadraticCurveTo(bowX, bowY, topX, horizonY);
            ctx.stroke();
        }

        for (let i = 0; i < 20; i += 1) {
            const p = ((i * 62 + depthTravel) % 900) / 900;
            const curve = p * p;
            const y = horizonY + curve * (canvas.height - horizonY);
            const width = curve * canvas.width * 1.05;
            ctx.strokeStyle = "rgba(255, 133, 68, " + (0.14 + curve * 0.22) + ")";
            ctx.beginPath();
            ctx.moveTo(centerX - width * 0.5, y);
            ctx.lineTo(centerX + width * 0.5, y);
            ctx.stroke();
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 186, 133, 0.85)";
        [-1, 1].forEach(function (edge) {
            const nearX = laneXAt(edge, 1);
            const farX = laneXAt(edge, 0);
            ctx.beginPath();
            ctx.moveTo(nearX, yAt(1));
            ctx.lineTo(farX, yAt(0));
            ctx.stroke();
        });

        ctx.setLineDash([12, 14]);
        ctx.strokeStyle = "rgba(255, 210, 170, 0.5)";
        ctx.beginPath();
        for (let i = 0; i <= 20; i += 1) {
            const t = i / 20;
            const x = laneXAt(0, t);
            const y = yAt(t);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "rgba(255, 145, 76, 0.56)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(canvas.width, groundY);
        ctx.stroke();

        if (state.started && state.running) {
            const streakCount = 10;
            const streakPhase = (travel * 0.9 * speedRatio) % 1;
            ctx.lineCap = "round";
            for (let i = 0; i < streakCount; i += 1) {
                const side = i % 2 === 0 ? -1 : 1;
                const lane = side * (0.05 + (Math.floor(i / 2) / streakCount) * 1.05);
                const localPhase = (streakPhase + i / streakCount) % 1;
                const t = localPhase * localPhase;
                const y = yAt(t);
                const trailT = Math.max(0, t - 0.045);
                const trailY = yAt(trailT);
                const x = laneXAt(lane, t);
                const trailX = laneXAt(lane, trailT);
                const alpha = 0.12 + t * 0.35;
                ctx.strokeStyle = "rgba(255, 200, 150, " + alpha + ")";
                ctx.lineWidth = 1 + t * 2;
                ctx.beginPath();
                ctx.moveTo(trailX, trailY);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
            ctx.lineCap = "butt";
        }
    }

    function drawPlayer() {
        const x = laneXAt(state.playerLane, 1);
        const bodyWidth = carWidth * 1.3;
        const bodyHeight = carHeight * 0.74;
        const rearY = groundY - 2;
        const roofY = rearY - bodyHeight;
        const half = bodyWidth * 0.5;

        // Rear-view sports car silhouette with tapered shoulders.
        ctx.beginPath();
        ctx.moveTo(x - half, rearY - 8);
        ctx.lineTo(x - half * 0.88, rearY - bodyHeight * 0.45);
        ctx.lineTo(x - half * 0.58, roofY + 6);
        ctx.lineTo(x + half * 0.58, roofY + 6);
        ctx.lineTo(x + half * 0.88, rearY - bodyHeight * 0.45);
        ctx.lineTo(x + half, rearY - 8);
        ctx.lineTo(x + half * 0.78, rearY);
        ctx.lineTo(x - half * 0.78, rearY);
        ctx.closePath();
        ctx.fillStyle = "#ffbf87";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ff7f32";
        ctx.stroke();

        // Back glass / engine cover.
        ctx.beginPath();
        ctx.moveTo(x - half * 0.42, rearY - bodyHeight * 0.54);
        ctx.lineTo(x - half * 0.25, roofY + 11);
        ctx.lineTo(x + half * 0.25, roofY + 11);
        ctx.lineTo(x + half * 0.42, rearY - bodyHeight * 0.54);
        ctx.closePath();
        ctx.fillStyle = "#ffd7b4";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ff7f32";
        ctx.stroke();

        // Rear diffuser bar.
        ctx.fillStyle = "#cf6d34";
        ctx.fillRect(x - half * 0.68, rearY - 7, half * 1.36, 5);

        // Taillights.
        ctx.fillStyle = "#ff6b4a";
        ctx.fillRect(x - half * 0.62, rearY - bodyHeight * 0.35, 7, 3);
        ctx.fillRect(x + half * 0.62 - 7, rearY - bodyHeight * 0.35, 7, 3);

        // Exhaust glow.
        ctx.fillStyle = "rgba(255, 161, 92, 0.9)";
        ctx.fillRect(x - 4, rearY - 2, 8, 2);
    }

    function drawObstacles() {
        state.obstacles.forEach(function (obstacle) {
            const t = Math.min(obstacle.t, 1);
            const width = obstacleWidthAt(t);
            const height = obstacleHeightAt(t);
            const x = laneXAt(obstacle.lane, t);
            const y = yAt(t);

            ctx.fillStyle = obstacle.shade ? "#ff934d" : "#ff7a3d";
            ctx.fillRect(x - width / 2, y - height, width, height);
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255, 214, 178, 0.55)";
            ctx.strokeRect(x - width / 2, y - height, width, height);
        });
    }

    function drawHud() {
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(12, 12, 190, 34);
        ctx.font = "600 16px 'IBM Plex Sans', sans-serif";
        ctx.fillStyle = "#f8eee4";
        ctx.fillText("Score: " + state.score, 22, 34);
    }

    function drawStartPrompt() {
        if (state.started || !state.running) return;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff4e7";
        ctx.textAlign = "center";
        ctx.font = "700 24px 'Space Grotesk', sans-serif";
        ctx.fillText("Hold left/right or press \u2190/\u2192 to drive", canvas.width / 2, canvas.height / 2);
        ctx.textAlign = "start";
    }

    function drawGameOver() {
        if (state.running) return;
        ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff4e7";
        ctx.textAlign = "center";
        ctx.font = "700 30px 'Space Grotesk', sans-serif";
        ctx.fillText("Crashed", canvas.width / 2, canvas.height / 2 - 8);
        ctx.font = "500 18px 'IBM Plex Sans', sans-serif";
        ctx.fillText("Score: " + state.score + "  -  Tap / click / arrow key to retry", canvas.width / 2, canvas.height / 2 + 26);
        ctx.textAlign = "start";
    }

    function render() {
        drawBackground();
        drawObstacles();
        drawPlayer();
        drawHud();
        drawStartPrompt();
        drawGameOver();
    }

    function loop(ts) {
        if (state.lastTs === null) {
            state.lastTs = ts;
        }
        const dt = Math.min((ts - state.lastTs) / 1000, 0.05);
        state.lastTs = ts;

        if (state.running && state.started) {
            state.speed = baseSpeed + Math.min(220, state.distance / 26);
            state.distance += state.speed * dt;
            state.score = Math.floor(state.distance / 10);

            updateSteering(dt);
            updateObstacles(dt);
            detectCollision();
        }

        render();

        if (state.running) {
            requestAnimationFrame(loop);
        }
    }

    function pointerDirFromClientX(clientX) {
        const rect = canvas.getBoundingClientRect();
        return clientX - rect.left < rect.width / 2 ? -1 : 1;
    }

    document.addEventListener("keydown", function (event) {
        const key = event.key.toLowerCase();
        const isLeft = key === "arrowleft" || key === "a";
        const isRight = key === "arrowright" || key === "d";
        if (!isLeft && !isRight) return;

        event.preventDefault();
        applyStartOrRestart();
        heldKeys.add(isLeft ? "left" : "right");
        recalcKeySteer();
    });

    document.addEventListener("keyup", function (event) {
        const key = event.key.toLowerCase();
        if (key === "arrowleft" || key === "a") heldKeys.delete("left");
        if (key === "arrowright" || key === "d") heldKeys.delete("right");
        recalcKeySteer();
    });

    canvas.addEventListener("mousedown", function (event) {
        event.preventDefault();
        applyStartOrRestart();
        state.steerPointerDir = pointerDirFromClientX(event.clientX);
    });

    canvas.addEventListener("mouseup", function () {
        state.steerPointerDir = 0;
    });

    canvas.addEventListener("mouseleave", function () {
        state.steerPointerDir = 0;
    });

    canvas.addEventListener("touchstart", function (event) {
        event.preventDefault();
        if (!event.touches || !event.touches.length) return;
        applyStartOrRestart();
        state.steerPointerDir = pointerDirFromClientX(event.touches[0].clientX);
    }, { passive: false });

    canvas.addEventListener("touchmove", function (event) {
        event.preventDefault();
        if (!event.touches || !event.touches.length) return;
        state.steerPointerDir = pointerDirFromClientX(event.touches[0].clientX);
    }, { passive: false });

    canvas.addEventListener("touchend", function (event) {
        event.preventDefault();
        state.steerPointerDir = 0;
    }, { passive: false });

    canvas.addEventListener("touchcancel", function () {
        state.steerPointerDir = 0;
    });

    resetButton.addEventListener("click", function () {
        resetGame();
    });

    scheduleNextSpawn();
    requestAnimationFrame(loop);
})();
