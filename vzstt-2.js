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
  waveDiv.style = 'margin-top: 10px; height: 50px; width: 100%; background: url(data:image/gif;base64,R0lGODlhEAAQAPIAAFVVVf8AAN/f39fX1////wAAAAAAAAAAACH5BAEAAAUALAAAAAAQABAAAAJphI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTNp2L1jef6A/PsgJGkEADs=) repeat-x;';
  waveDiv.style.display = 'none'; // Initially hidden
  controlsDiv.appendChild(waveDiv);

  // JavaScript for handling recording and WebSocket connection
  let mediaRecorder;
  let socket;
  let audioChunks = [];

  function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    waveDiv.style.display = 'block'; // Show wave simulator
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started');
        statusDiv.textContent = 'Status: Recording...';
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
        statusDiv.textContent = 'Status: Processing...';
        waveDiv.style.display = 'none'; // Hide wave simulator
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];

        socket = new WebSocket('ws://localhost:8000');

        socket.onopen = () => {
          socket.send(audioBlob);
        };

        socket.onmessage = (message) => {
          const received = JSON.parse(message.data);
          console.log('Received:', received);
          transcriptDiv.textContent = `Transcription: ${received.text}`;
        };

        socket.onclose = () => {
          statusDiv.textContent = 'Status: Disconnected';
        };

        socket.onerror = (error) => {
          statusDiv.textContent = 'Status: Error';
          console.error('WebSocket error:', error);
        };
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.start();
      startButton.disabled = true;
      stopButton.disabled = false;
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
    startButton.disabled = false;
    stopButton.disabled = true;
  }

  // Add event listeners to the buttons
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();
