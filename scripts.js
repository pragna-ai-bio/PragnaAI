document.addEventListener("DOMContentLoaded", function () {
  const navLinks = document.querySelectorAll(".nav-link, .mobile-nav-link");
  const pages = document.querySelectorAll(".page");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mobileNavLinks = document.getElementById("mobile-nav-links");
  const voiceDemoBtn = document.getElementById("voice-demo-btn");
  const photoacousticDemoBtn = document.getElementById("photoacoustic-demo-btn");

  // -------------------------
  // NAVIGATION HANDLER
  // -------------------------
  function handleNavigation(e) {
    e.preventDefault();

    // Remove active state
    navLinks.forEach((nav) => nav.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    // Activate clicked tab
    this.classList.add("active");

    // Show correct page
    const pageId = this.dataset.page + "-page";
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add("active");

    // Close mobile nav
    mobileNavLinks.classList.remove("active");
  }

  // Attach navigation to all nav links
  navLinks.forEach((nav) => {
    nav.addEventListener("click", handleNavigation);
  });

  // -------------------------
  // VOICE DEMO BUTTON
  // -------------------------
  voiceDemoBtn.addEventListener("click", function (e) {
    e.preventDefault();

    navLinks.forEach((nav) => nav.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    // Show voice page
    document.getElementById("voice-page").classList.add("active");

    // Close mobile menu
    mobileNavLinks.classList.remove("active");

    window.scrollTo(0, 0);
  });

  // -------------------------
  // PHOTOACOUSTIC DEMO
  // -------------------------
  photoacousticDemoBtn.addEventListener("click", function (e) {
    e.preventDefault();
    alert("Photoacoustic demo would launch here. This is a prototype demonstration.");
  });

  // -------------------------
  // MOBILE MENU TOGGLE
  // -------------------------
  mobileMenuToggle.addEventListener("click", function () {
    mobileNavLinks.classList.toggle("active");
  });

  // Close mobile menu on outside click
  document.addEventListener("click", function (e) {
    if (
      !e.target.closest(".header-content") &&
      !e.target.closest(".mobile-nav-links")
    ) {
      mobileNavLinks.classList.remove("active");
    }
  });

  // -------------------------
  // VOICE RECORDING SECTION
  // -------------------------

  const recordBtn = document.getElementById("record-btn");
  const stopBtn = document.getElementById("stop-btn");
  const playBtn = document.getElementById("play-btn");
  const recordingIndicator = document.getElementById("recording-indicator");
  const audioPlayer = document.getElementById("audio-player");
  const analysisResult = document.getElementById("analysis-result");
  const graphCanvas = document.getElementById("voice-graph");
  const status = document.getElementById("status");
  const spinner = document.getElementById("spinner");

  let mediaRecorder;
  let audioChunks = [];
  let audioContext;
  let analyser;
  let dataArray;
  let graphCtx;
  let animationId;

  // Init Graph
  if (graphCanvas) {
    graphCtx = graphCanvas.getContext("2d");
    graphCanvas.width = graphCanvas.offsetWidth;
    graphCanvas.height = graphCanvas.offsetHeight;
    drawEmptyGraph();
  }

  // Check browser permission
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    recordBtn.addEventListener("click", startRecording);
    stopBtn.addEventListener("click", stopRecording);
    playBtn.addEventListener("click", playRecording);
  } else {
    recordBtn.disabled = true;
    recordBtn.innerHTML =
      '<i class="fas fa-microphone-slash"></i> Recording Not Supported';
  }

  // -------------------------
  // START RECORDING
  // -------------------------
  function startRecording() {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 2048;
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
          const audioUrl = URL.createObjectURL(audioBlob);
          audioPlayer.src = audioUrl;
          playBtn.disabled = false;

          status.textContent = "Analyzing voice recording...";
          spinner.style.display = "block";

          setTimeout(() => {
            spinner.style.display = "none";
            analysisResult.style.display = "block";
            status.textContent = "Analysis complete. See results below.";

            const randomResult = Math.floor(Math.random() * 15);
            document.querySelector(".result-value").textContent =
              randomResult + "%";

            drawPhotoacousticGraphFromRecording(randomResult);
          }, 3000);
        };

        mediaRecorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordingIndicator.classList.add("active");
        audioPlayer.style.display = "none";
        analysisResult.style.display = "none";

        drawRealTimeGraph();
      })
      .catch(() => {
        alert("Unable to access microphone. Please allow permission.");
      });
  }

  // -------------------------
  // STOP RECORDING
  // -------------------------
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      recordingIndicator.classList.remove("active");
      audioPlayer.style.display = "block";

      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      if (animationId) cancelAnimationFrame(animationId);

      if (audioContext) audioContext.close();
    }
  }

  // -------------------------
  // PLAY RECORDING
  // -------------------------
  function playRecording() {
    audioPlayer.play();
  }

  // -------------------------
  // DRAW EMPTY GRAPH (initial)
  // -------------------------
  function drawEmptyGraph() {
    const width = graphCanvas.width;
    const height = graphCanvas.height;

    graphCtx.clearRect(0, 0, width, height);
    graphCtx.fillStyle = "#666";
    graphCtx.font = "18px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Record voice to see analysis", width / 2, height / 2);
  }

  // -------------------------
  // REAL-TIME GRAPH
  // -------------------------
  function drawRealTimeGraph() {
    const width = graphCanvas.width;
    const height = graphCanvas.height;

    function draw() {
      analyser.getByteFrequencyData(dataArray);

      graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
      graphCtx.fillRect(0, 0, width, height);

      const barWidth = (width - 70) / dataArray.length;
      graphCtx.fillStyle = "rgba(255, 215, 0, 0.7)";

      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * (height - 60);
        graphCtx.fillRect(
          50 + i * barWidth,
          height - 30 - barHeight,
          barWidth - 1,
          barHeight
        );
      }

      if (mediaRecorder && mediaRecorder.state === "recording") {
        animationId = requestAnimationFrame(draw);
      }
    }
    animationId = requestAnimationFrame(draw);
  }


  function drawPhotoacousticGraphFromRecording(result) {
    if (!graphCtx) return;

    const width = graphCanvas.width;
    const height = graphCanvas.height;

    // Clear canvas
    graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
    graphCtx.fillRect(0, 0, width, height);

    // Draw axes
    graphCtx.strokeStyle = "#555";
    graphCtx.lineWidth = 1;
    graphCtx.beginPath();
    graphCtx.moveTo(50, 20);
    graphCtx.lineTo(50, height - 30);
    graphCtx.lineTo(width - 20, height - 30);
    graphCtx.stroke();

    // Draw labels
    graphCtx.fillStyle = "#999";
    graphCtx.font = "14px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Frequency (Hz)", width / 2, height - 5);
    graphCtx.save();
    graphCtx.translate(15, height / 2);
    graphCtx.rotate(-Math.PI / 2);
    graphCtx.fillText("Amplitude", 0, 0);
    graphCtx.restore();

    // Draw title
    graphCtx.fillStyle = "#fff";
    graphCtx.font = "16px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Photoacoustic Voice Spectrum Analysis", width / 2, 15);

    // Generate wave equation-based graph
    const dataPoints = 500;
    const frequencies = [];
    const amplitudes = [];

    // Create a complex waveform using wave equations
    for (let i = 0; i < dataPoints; i++) {
      const x = (i / dataPoints) * (width - 70) + 50;
      const freq = (i / dataPoints) * 5000; // Frequency range up to 5kHz

      // Wave equation: A*sin(2πft + φ) + B*sin(4πft + φ2) + C*sin(6πft + φ3) + ...
      // This creates a complex waveform with multiple harmonics
      let amplitude = 0;

      // Fundamental frequency (typical voice range)
      amplitude += Math.sin(2 * Math.PI * freq * 0.001) * 0.8;

      // Second harmonic
      amplitude += Math.sin(4 * Math.PI * freq * 0.001 + 0.5) * 0.6;

      // Third harmonic
      amplitude += Math.sin(6 * Math.PI * freq * 0.001 + 1.2) * 0.4;

      // Fourth harmonic
      amplitude += Math.sin(8 * Math.PI * freq * 0.001 + 2.1) * 0.3;

      // Fifth harmonic
      amplitude += Math.sin(10 * Math.PI * freq * 0.001 + 3.4) * 0.2;

      // Add some noise for realism
      amplitude += (Math.random() - 0.5) * 0.1;

      // Apply envelope function to shape the spectrum
      amplitude *= Math.exp(-Math.pow(freq - 1000, 2) / 500000);

      // Scale to canvas height
      const barHeight = Math.abs(amplitude) * (height - 60) * 0.8;

      frequencies.push(x);
      amplitudes.push(barHeight);
    }

    // Draw the photoacoustic spectrum as a continuous line
    graphCtx.strokeStyle = "rgba(255, 215, 0, 0.9)";
    graphCtx.lineWidth = 2;
    graphCtx.beginPath();

    for (let i = 0; i < frequencies.length; i++) {
      if (i === 0) {
        graphCtx.moveTo(frequencies[i], height - 30 - amplitudes[i]);
      } else {
        graphCtx.lineTo(frequencies[i], height - 30 - amplitudes[i]);
      }
    }

    graphCtx.stroke();

    // Fill under the curve for better visualization
    graphCtx.fillStyle = "rgba(255, 215, 0, 0.2)";
    graphCtx.beginPath();
    graphCtx.moveTo(frequencies[0], height - 30);

    for (let i = 0; i < frequencies.length; i++) {
      graphCtx.lineTo(frequencies[i], height - 30 - amplitudes[i]);
    }

    graphCtx.lineTo(frequencies[frequencies.length - 1], height - 30);
    graphCtx.closePath();
    graphCtx.fill();

    // Highlight potential biomarker regions based on mathematical frequency analysis
    const biomarkerRegions = [
      { start: 180, end: 280, label: "Low Frequency Biomarker" },
      { start: 320, end: 420, label: "Mid Frequency Biomarker" },
      { start: 480, end: 580, label: "High Frequency Biomarker" },
    ];

    biomarkerRegions.forEach((region) => {
      // Draw biomarker region highlight
      graphCtx.fillStyle = "rgba(255, 100, 100, 0.3)";
      graphCtx.fillRect(
        region.start,
        20,
        region.end - region.start,
        height - 50
      );

      // Add biomarker labels
      graphCtx.fillStyle = "rgba(255, 100, 100, 0.8)";
      graphCtx.font = "12px Arial";
      graphCtx.textAlign = "center";
      graphCtx.fillText(region.label, (region.start + region.end) / 2, 15);
    });

    // Add mathematical annotations
    graphCtx.fillStyle = "rgba(200, 200, 255, 0.8)";
    graphCtx.font = "12px Arial";
    graphCtx.textAlign = "left";
    graphCtx.fillText("Wave Equation: Σ Aₙsin(2πnft + φₙ)", 60, 40);
    graphCtx.fillText("Fundamental Frequency: ~500 Hz", 60, 60);
    graphCtx.fillText("Harmonics: 2nd, 3rd, 4th, 5th order", 60, 80);
  }
});

// Page navigation
document.addEventListener("DOMContentLoaded", function () {
    const navLinks = document.querySelectorAll(".nav-link, .mobile-nav-link");
    const pages = document.querySelectorAll(".page");

    navLinks.forEach(link => {
        link.addEventListener("click", function (event) {
            event.preventDefault();

            const targetPage = this.getAttribute("data-page") + "-page";

            // Remove active class from links
            navLinks.forEach(l => l.classList.remove("active"));
            this.classList.add("active");

            // Hide all pages
            pages.forEach(page => page.classList.remove("active"));

            // Show selected page
            const selected = document.getElementById(targetPage);
            if (selected) selected.classList.add("active");

            // Close mobile menu if open
            document.getElementById("mobile-nav-links").classList.remove("open");
        });
    });

    // DEMO → VOICE PAGE BUTTON
    voiceDemoBtn.addEventListener("click", function (e) {
      e.preventDefault();
      pages.forEach((page) => page.classList.remove("active"));
      document.getElementById("voice-page").classList.add("active");
    });

    // PHOTOACOUSTIC DEMO BUTTON (same logic if needed)
    document.getElementById("photoacoustic-demo-btn").addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "pas_demo.html"; 
    });


});
