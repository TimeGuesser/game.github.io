(function() {
    // ----- ДАННЫЕ ВОПРОСОВ -----
    const QUESTIONS = [
        { imageUrl: "img/red_square.jpg", correctLat: 55.7537, correctLng: 37.6199, correctYear: 1905, description: "Красная площадь, Москва, начало XX века" },
        { imageUrl: "img/nevsky.jpg", correctLat: 59.9343, correctLng: 30.3061, correctYear: 1910, description: "Невский проспект, Санкт-Петербург, 1910-е" },
        { imageUrl: "img/vladivostok_station.jpg", correctLat: 43.1155, correctLng: 131.8855, correctYear: 1995, description: "Железнодорожный вокзал Владивостока" },
        { imageUrl: "img/baikal.jpg", correctLat: 53.5, correctLng: 107.5, correctYear: 1980, description: "Озеро Байкал" },
        { imageUrl: "img/catherine_palace.jpg", correctLat: 59.7167, correctLng: 30.3964, correctYear: 1912, description: "Царское Село, Екатерининский дворец" }
    ];

    // DOM элементы игры
    const yearSlider = document.getElementById('yearSlider');
    const yearValueDisplay = document.getElementById('yearValueDisplay');
    const actionBtn = document.getElementById('actionBtn');
    const totalScoreSpan = document.getElementById('totalScore');
    const lastPointsSpan = document.getElementById('lastPoints');
    const coordsDisplay = document.getElementById('coordsDisplay');
    const historicalImg = document.getElementById('historicalImage');
    const switchViewBtn = document.getElementById('switchViewBtn');
    const mapView = document.getElementById('mapView');
    const imageView = document.getElementById('imageView');
    const infoBlock = document.getElementById('infoBlock');
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const imageWrapper = document.getElementById('imageWrapper');

    // Переменные игры
    let currentIndex = 0;
    let userMarker = null, correctMarker = null, distanceLine = null;
    let selectedLat = null, selectedLng = null;
    let selectedYear = 1950;
    let totalPoints = 0;
    let questionAnswered = false;
    let map = null;
    let currentView = 'image';

    // --- Управление изображением (без изменений) ---
    let imgW = 0, imgH = 0;
    let scale = 1, translateX = 0, translateY = 0;
    let drag = false, dragStartX = 0, dragStartY = 0, dragStartTranslateX = 0, dragStartTranslateY = 0;

    function updateTransform() {
        historicalImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function applyBounds() {
        if (imgW === 0) return;
        const rect = imageWrapper.getBoundingClientRect();
        const imgW_scaled = imgW * scale;
        const imgH_scaled = imgH * scale;
        const maxX = Math.max(0, (imgW_scaled - rect.width) / 2);
        const maxY = Math.max(0, (imgH_scaled - rect.height) / 2);
        translateX = Math.min(maxX, Math.max(-maxX, translateX));
        translateY = Math.min(maxY, Math.max(-maxY, translateY));
        updateTransform();
    }

    function resetImage() {
        if (imgW === 0 || imgH === 0) return;
        const rect = imageWrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        scale = Math.min(rect.width / imgW, rect.height / imgH);
        translateX = (rect.width - imgW * scale) / 2;
        translateY = (rect.height - imgH * scale) / 2;
        updateTransform();
    }

    function setZoom(delta, clientX, clientY) {
        if (imgW === 0) return;
        const rect = imageWrapper.getBoundingClientRect();
        const oldScale = scale;
        let newScale = scale + delta;
        newScale = Math.min(3, Math.max(0.5, newScale));
        if (newScale === oldScale) return;
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        const oldX = (cx - translateX) / oldScale;
        const oldY = (cy - translateY) / oldScale;
        scale = newScale;
        translateX = cx - oldX * scale;
        translateY = cy - oldY * scale;
        applyBounds();
    }

    function loadImage() {
        const q = QUESTIONS[currentIndex];
        const img = new Image();
        img.onload = () => {
            imgW = img.width;
            imgH = img.height;
            historicalImg.src = q.imageUrl;
            historicalImg.style.width = `${imgW}px`;
            historicalImg.style.height = `${imgH}px`;
            resetImage();
        };
        img.onerror = () => {
            imgW = 400; imgH = 260;
            historicalImg.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="100%" height="100%" fill="#6c757d"/><text x="200" y="130" text-anchor="middle" fill="white" font-size="18">Не загружено</text><text x="200" y="170" text-anchor="middle" fill="#f8f9fa" font-size="14">${q.description}</text></svg>`)}`;
            historicalImg.style.width = '400px';
            historicalImg.style.height = '260px';
            resetImage();
        };
        img.src = q.imageUrl;
    }

    // --- Мышь и тач для изображения (без изменений) ---
    function onMouseDown(e) {
        if (currentView !== 'image') return;
        e.preventDefault();
        drag = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartTranslateX = translateX;
        dragStartTranslateY = translateY;
        imageWrapper.style.cursor = 'grabbing';
    }
    function onMouseMove(e) {
        if (!drag || currentView !== 'image') return;
        e.preventDefault();
        translateX = dragStartTranslateX + (e.clientX - dragStartX);
        translateY = dragStartTranslateY + (e.clientY - dragStartY);
        applyBounds();
    }
    function onMouseUp() {
        drag = false;
        imageWrapper.style.cursor = 'grab';
    }
    function onWheel(e) {
        if (currentView !== 'image') return;
        e.preventDefault();
        setZoom(e.deltaY > 0 ? -0.1 : 0.1, e.clientX, e.clientY);
    }

    let touchData = { scale: 1, dist: 0, active: false, startTranslateX: 0, startTranslateY: 0 };
    function onTouchStart(e) {
        if (currentView !== 'image') return;
        const touches = e.touches;
        if (touches.length === 1) {
            touchData.active = true;
            touchData.startX = touches[0].clientX;
            touchData.startY = touches[0].clientY;
            touchData.startTranslateX = translateX;
            touchData.startTranslateY = translateY;
            e.preventDefault();
        } else if (touches.length === 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            touchData.dist = Math.hypot(dx, dy);
            touchData.scale = scale;
            touchData.active = true;
            e.preventDefault();
        }
    }
    function onTouchMove(e) {
        if (currentView !== 'image') return;
        const touches = e.touches;
        if (touches.length === 1 && touchData.active && !touchData.dist) {
            const dx = touches[0].clientX - touchData.startX;
            const dy = touches[0].clientY - touchData.startY;
            translateX = touchData.startTranslateX + dx;
            translateY = touchData.startTranslateY + dy;
            applyBounds();
            e.preventDefault();
        } else if (touches.length === 2 && touchData.dist) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const newDist = Math.hypot(dx, dy);
            const delta = (newDist / touchData.dist) * touchData.scale - scale;
            const centerX = (touches[0].clientX + touches[1].clientX) / 2;
            const centerY = (touches[0].clientY + touches[1].clientY) / 2;
            setZoom(delta, centerX, centerY);
            e.preventDefault();
        }
    }
    function onTouchEnd() {
        touchData = { scale: 1, dist: 0, active: false, startTranslateX: 0, startTranslateY: 0 };
    }

    // --- Яндекс.Карты ---
    let ymapsReady = false;
    let mapInitPromise = null;

function initYandexMap() {
    if (mapInitPromise) return mapInitPromise;
    mapInitPromise = new Promise((resolve) => {
        if (window.ymaps) {
            window.ymaps.ready(() => {
                map = new window.ymaps.Map("mapView", {
                    center: [62.0, 95.0],
                    zoom: 4,
                    controls: ["zoomControl"] // оставляем только кнопку зума
                }, {
                    suppressMapOpenBlock: true, // убираем сообщение об открытии в приложении
                    yandexMapDisablePoiInteractivity: true // отключаем интерактивность POI
                });
                // Ограничим область видимости
                map.options.set("restrictMapArea", [[41, 19], [82, 190]]);
                // Обработчик клика
                map.events.add("click", (e) => {
                    if (questionAnswered) {
                        setInfo("⚠️ Вопрос уже проверен! Нажмите «Следующий».", 3000);
                        return;
                    }
                    const coords = e.get("coords");
                    selectedLat = coords[0];
                    selectedLng = coords[1];
                    coordsDisplay.innerText = `${selectedLat.toFixed(2)}°, ${selectedLng.toFixed(2)}°`;
                    if (userMarker) map.geoObjects.remove(userMarker);
                    userMarker = new window.ymaps.Placemark(coords, {
                        hintContent: "Ваш выбор",
                    }, {
                        preset: "islands#blueCircleIcon",
                    });
                    map.geoObjects.add(userMarker);
                    setInfo(`✅ Место выбрано: ${selectedLat.toFixed(2)}°, ${selectedLng.toFixed(2)}°`, 2000);
                });
                resolve();
            });
        } else {
            setTimeout(initYandexMap, 100);
        }
    });
    return mapInitPromise;
}

    function clearMapMarkers() {
        if (!map) return;
        if (userMarker) map.geoObjects.remove(userMarker);
        if (correctMarker) map.geoObjects.remove(correctMarker);
        if (distanceLine) map.geoObjects.remove(distanceLine);
        userMarker = correctMarker = distanceLine = null;
    }

    function addCorrectMarker(lat, lng, year) {
        correctMarker = new window.ymaps.Placemark([lat, lng], {
            hintContent: `Правильное место (год ${year})`,
        }, {
            preset: "islands#greenCircleIcon",
        });
        map.geoObjects.add(correctMarker);
    }

    function drawLineAndZoom(ul, ulng, cl, clng) {
        if (distanceLine) map.geoObjects.remove(distanceLine);
        distanceLine = new window.ymaps.Polyline([[ul, ulng], [cl, clng]], {}, {
            strokeColor: "#ff8c42",
            strokeWidth: 3,
            strokeStyle: "dash",
        });
        map.geoObjects.add(distanceLine);
        // Приближаем к линии с отступом
        const bounds = window.ymaps.util.bounds.fromPoints([[ul, ulng], [cl, clng]]);
        map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 70 });
    }

    // --- Игровая логика (без изменений) ---
    function getDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI/180;
        const dLng = (lng2 - lng1) * Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    function calcPoints(ul, uLng, uYear, cl, cLng, cYear) {
        const dist = getDistance(ul, uLng, cl, cLng);
        const ydiff = Math.abs(uYear - cYear);
        const pDist = Math.max(0, 100 * (1 - Math.min(1, dist/2000)));
        const pYear = Math.max(0, 100 * (1 - Math.min(1, ydiff/80)));
        return { final: Math.round((pDist+pYear)/2*100)/100, dist, ydiff };
    }

    let infoTimeout;
    function setInfo(msg, dur = 3000) {
        clearTimeout(infoTimeout);
        infoBlock.innerHTML = msg;
        infoTimeout = setTimeout(() => {
            if (!questionAnswered) infoBlock.innerHTML = "📍 Нажми на карту, чтобы выбрать место, и выбери год на ползунке";
        }, dur);
    }

    function switchView() {
        if (currentView === 'image') {
            mapView.classList.remove('view-hidden');
            imageView.classList.add('view-hidden');
            currentView = 'map';
            document.getElementById('switchIcon').innerHTML = '🖼️';
            // инвалидируем размер карты
            if (map) map.container.fitToViewport();
        } else {
            mapView.classList.add('view-hidden');
            imageView.classList.remove('view-hidden');
            currentView = 'image';
            document.getElementById('switchIcon').innerHTML = '🗺️';
            resetImage();
        }
    }

    function zoomImage(delta) {
        if (currentView !== 'image') return;
        const rect = imageWrapper.getBoundingClientRect();
        setZoom(delta, rect.left + rect.width/2, rect.top + rect.height/2);
    }

    function loadQuestion() {
        questionAnswered = false;
        actionBtn.disabled = false;
        actionBtn.innerText = "✅ ПРОВЕРИТЬ";
        actionBtn.onclick = handleCheck;
        setInfo("📍 Нажми на карту, чтобы выбрать место, и выбери год на ползунке", 2000);
        clearMapMarkers();
        selectedLat = selectedLng = null;
        coordsDisplay.innerText = '—';
        lastPointsSpan.innerText = '—';
        const q = QUESTIONS[currentIndex];
        const randYear = Math.floor(Math.random() * (2024-1850+1)) + 1850;
        yearSlider.value = randYear;
        selectedYear = randYear;
        yearValueDisplay.innerText = randYear;
        loadImage();
    }

    function updateYear() {
        selectedYear = parseInt(yearSlider.value);
        yearValueDisplay.innerText = selectedYear;
    }
    yearSlider.addEventListener('input', () => {
        if (questionAnswered) {
            setInfo("⚠️ Вопрос уже проверен, изменить год нельзя.", 2000);
            yearSlider.value = selectedYear;
            return;
        }
        updateYear();
    });

    function handleCheck() {
        if (questionAnswered) {
            setInfo("❗ Ты уже получил очки. Нажми «Следующий».", 3000);
            return;
        }
        if (selectedLat === null) {
            setInfo("⚠️ Сначала выбери место на карте!", 3000);
            return;
        }
        actionBtn.disabled = true;
        const q = QUESTIONS[currentIndex];
        const res = calcPoints(selectedLat, selectedLng, selectedYear, q.correctLat, q.correctLng, q.correctYear);
        totalPoints += res.final;
        totalScoreSpan.innerText = Math.floor(totalPoints*100)/100;
        lastPointsSpan.innerText = res.final.toFixed(1);
        setInfo(`✅ <strong>Правильный ответ:</strong> ${q.description}<br>📍 Координаты: ${q.correctLat.toFixed(2)}°, ${q.correctLng.toFixed(2)}°<br>🗓️ Год: ${q.correctYear}<br>📏 Ваше расстояние: ${res.dist.toFixed(1)} км`, 8000);
        addCorrectMarker(q.correctLat, q.correctLng, q.correctYear);
        drawLineAndZoom(selectedLat, selectedLng, q.correctLat, q.correctLng);
        if (userMarker) userMarker.properties.set("hintContent", `Ваш выбор (${selectedYear} г.)<br>Расстояние: ${res.dist.toFixed(1)} км`);
        questionAnswered = true;
        if (currentIndex+1 < QUESTIONS.length) {
            actionBtn.innerText = "➡️ СЛЕДУЮЩИЙ ВОПРОС";
            actionBtn.disabled = false;
            actionBtn.onclick = () => {
                if (!questionAnswered) return;
                if (currentView === 'map') switchView();
                currentIndex++;
                loadQuestion();
            };
        } else {
            actionBtn.innerText = "🏁 ФИНИШ";
            actionBtn.disabled = false;
            actionBtn.onclick = () => {
                setInfo(`Игра завершена! Счёт: ${Math.floor(totalPoints*100)/100} из ${QUESTIONS.length*100}`, 5000);
                actionBtn.disabled = true;
            };
        }
    }

    // --- Запуск игры ---
    async function startGame() {
        await initYandexMap();
        totalPoints = 0;
        totalScoreSpan.innerText = "0";
        currentIndex = 0;
        loadQuestion();
        mapView.classList.add('view-hidden');
        imageView.classList.remove('view-hidden');
        currentView = 'image';
        document.getElementById('switchIcon').innerHTML = '🗺️';
    }

    // --- Переключение между меню и игрой ---
    const menuScreen = document.getElementById('menuScreen');
    const gameScreen = document.getElementById('gameScreen');
    const singleBtn = document.getElementById('singlePlayerBtn');
    const multiBtn = document.getElementById('multiPlayerBtn');
    const backBtn = document.getElementById('backToMenuBtn');

    singleBtn.addEventListener('click', () => {
        menuScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        startGame();
    });
    multiBtn.addEventListener('click', () => {
        alert("Многопользовательский режим в разработке. Скоро появится!");
    });
    backBtn.addEventListener('click', () => {
        gameScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');
    });

    // Подключаем обработчики управления изображением
    imageWrapper.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    imageWrapper.addEventListener('wheel', onWheel, { passive: false });
    imageWrapper.style.cursor = 'grab';

    imageWrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    imageWrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    imageWrapper.addEventListener('touchend', onTouchEnd);
    imageWrapper.addEventListener('touchcancel', onTouchEnd);

    switchViewBtn.addEventListener('click', switchView);
    zoomInBtn.addEventListener('click', () => zoomImage(0.2));
    zoomOutBtn.addEventListener('click', () => zoomImage(-0.2));

    window.addEventListener('resize', () => {
        if (!gameScreen.classList.contains('hidden') && currentView === 'image') {
            resetImage();
        } else if (map) {
            map.container.fitToViewport();
        }
    });
})();
