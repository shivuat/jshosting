(async function() {
  // Create and style the controls div
  var controlsDiv = document.createElement('div');
  controlsDiv.id = 'controls';
  controlsDiv.style = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px;';
  document.body.appendChild(controlsDiv);

  // Create and style the start button
  var startButton = document.createElement('button');
  startButton.id = 'startButton';
  startButton.innerText = 'Start Recording';
  startButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
  controlsDiv.appendChild(startButton);

  // Create and style the stop button
  var stopButton = document.createElement('button');
  stopButton.id = 'stopButton';
  stopButton.innerText = 'Stop Recording';
  stopButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;';
  stopButton.disabled = true;
  controlsDiv.appendChild(stopButton);

  // Create and style the status div
  var statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.innerText = 'Status: Not Connected';
  statusDiv.style = 'margin-top: 10px; padding: 5px; background-color: lightgray;';
  controlsDiv.appendChild(statusDiv);

  // Create and style the transcript div
  var transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'margin-top: 10px; white-space: pre-wrap; word-wrap: break-word; height: 400px; max-height: 1400px; width: 1000px; overflow-y: scroll; border: 1px solid black; padding: 5px;';
  controlsDiv.appendChild(transcriptDiv);

  // Create and style the results div
  var resultsDiv = document.createElement('div');
  resultsDiv.id = 'results';
  resultsDiv.style = 'margin-top: 10px; padding: 5px;';
  controlsDiv.appendChild(resultsDiv);

  // Create and style the waveform canvas
  var canvas = document.createElement('canvas');
  canvas.id = 'waveform';
  canvas.width = 1000;
  canvas.height = 100;
  canvas.style = 'margin-top: 10px; border: 1px solid black;';
  controlsDiv.appendChild(canvas);

  // JavaScript for handling recording, WebSocket connection, and waveform visualization
  let mediaRecorder;
  let audioContext;
  let analyser;
  let dataArray;
  let bufferLength;
  let canvasContext;
  let socket;
  let audioChunks = [];

  function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 2048;
      bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      canvasContext = canvas.getContext('2d');

      mediaRecorder = new MediaRecorder(stream);
      socket = new WebSocket('ws://localhost:8000');

      socket.onopen = () => {
        statusDiv.textContent = 'Status: Connected';
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        };
        mediaRecorder.start(1000);
        startButton.disabled = true;
        stopButton.disabled = false;
        drawWaveform();
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        console.log('Received:', received);
        transcriptDiv.textContent += `${received.text}\n`;
      };

      socket.onclose = () => {
        statusDiv.textContent = 'Status: Disconnected';
      };

      socket.onerror = (error) => {
        statusDiv.textContent = 'Status: Error';
        console.error('WebSocket error:', error);
      };
    }).catch(error => {
      statusDiv.textContent = 'Error accessing media devices';
      console.error('Error accessing media devices:', error);
    });
  }

  function stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    if (socket) {
      socket.close();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = 'Status: Not Connected';

    // Send transcript to the Python service
    const transcript = transcriptDiv.textContent.trim();
    fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript }),
    })
    .then(response => response.json())
    .then(data => {
      displayResults(data);
    })
    .catch(error => {
      console.error('Error:', error);
    });
  }

  function displayResults(analysis) {
    const resultsBox = document.createElement('div');
    resultsBox.style = 'border: 1px solid black; padding: 10px; margin-top: 10px;';

    const resultsTitle = document.createElement('h3');
    resultsTitle.textContent = 'Analysis Results:';
    resultsBox.appendChild(resultsTitle);

    if (analysis.error) {
      const errorContent = document.createElement('p');
      errorContent.textContent = `Error: ${analysis.error}`;
      resultsBox.appendChild(errorContent);
    } else {
      const summaryContent = document.createElement('p');
      summaryContent.textContent = `Summary: ${analysis.summary}`;
      summaryContent.className = 'summary';
      resultsBox.appendChild(summaryContent);

      const intentContent = document.createElement('p');
      intentContent.textContent = `Intent: ${analysis.intent}`;
      intentContent.className = 'intent';
      resultsBox.appendChild(intentContent);

      const nerContent = document.createElement('p');
      nerContent.textContent = `Named Entities: ${analysis.ner}`;
      nerContent.className = 'ner';
      resultsBox.appendChild(nerContent);
    }

    resultsDiv.appendChild(resultsBox);
  }

  // Add event listeners to the buttons
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);

  // Adding styles for summary, intent, and NER
  const style = document.createElement('style');
  style.innerHTML = `
    .summary {
      background-color: #e0f7fa;
      padding: 5px;
      border-radius: 5px;
    }
    .intent {
      background-color: #fff3e0;
      padding: 5px;
      border-radius: 5px;
    }
    .ner {
      background-color: #e0ffe0;
      padding: 5px;
      border-radius: 5px;
    }
  `;
  document.head.appendChild(style);

  // Function to draw waveform
  function drawWaveform() {
    requestAnimationFrame(drawWaveform);

    analyser.getByteTimeDomainData(dataArray);

    canvasContext.fillStyle = 'white';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = 'black';

    canvasContext.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;

      if (i === 0) {
        canvasContext.moveTo(x, y);
      } else {
        canvasContext.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasContext.lineTo(canvas.width, canvas.height / 2);
    canvasContext.stroke();
  }
})();
