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

  // Create and style the wave simulator div
  var waveDiv = document.createElement('div');
  waveDiv.id = 'wave';
  waveDiv.style = 'margin-top: 10px; height: 50px; width: 100%; display: none;'; // Initially hidden
  controlsDiv.appendChild(waveDiv);

  // Add wave animation styles
  const style = document.createElement('style');
  style.innerHTML = `
    .wave {
      width: 5px;
      height: 100%;
      background: #4CAF50;
      display: inline-block;
      animation: wave 1s infinite ease-in-out;
    }
    .wave:nth-child(1) { animation-delay: -0.4s; }
    .wave:nth-child(2) { animation-delay: -0.3s; }
    .wave:nth-child(3) { animation-delay: -0.2s; }
    .wave:nth-child(4) { animation-delay: -0.1s; }
    .wave:nth-child(5) { animation-delay: 0s; }
    @keyframes wave {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(2); }
    }
  `;
  document.head.appendChild(style);

  // JavaScript for handling recording and WebSocket connection
  let mediaRecorder;
  let socket;

  function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    waveDiv.style.display = 'block'; // Show wave simulator
    for (let i = 0; i < 5; i++) {
      const bar = document.createElement('div');
      bar.className = 'wave';
      waveDiv.appendChild(bar);
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started');
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
        waveDiv.style.display = 'none'; // Hide wave simulator
        while (waveDiv.firstChild) {
          waveDiv.removeChild(waveDiv.firstChild);
        }
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          console.log('Sending audio data:', event.data);
          socket.send(event.data);
        }
      };

      socket = new WebSocket('ws://localhost:8000');

      socket.onopen = () => {
        statusDiv.textContent = 'Status: Connected';
        mediaRecorder.start(1000); // Send data every second
        startButton.disabled = true;
        stopButton.disabled = false;
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
  }

  // Add event listeners to the buttons
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();
