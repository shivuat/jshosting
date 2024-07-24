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

  // JavaScript for handling recording and WebSocket connection
  let mediaRecorder;
  let socket;
  let audioChunks = [];

  function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started');
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped');
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];

        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');

        socket = new WebSocket('ws://localhost:8000');

        socket.onopen = () => {
          statusDiv.textContent = 'Status: Connected';
          socket.send(audioBlob);
        };

        socket.onmessage = (message) => {
          const received = JSON.parse(message.data);
          console.log('Received:', received);
          const { text, diarization } = received;
          transcriptDiv.textContent += `${text}\n`;
          diarization.forEach(d => {
            transcriptDiv.textContent += `${d}\n`;
          });
        };

        socket.onclose = () => {
          statusDiv.textContent = 'Status: Disconnected';
        };

        socket.onerror = (error) => {
          statusDiv.textContent = 'Status: Error';
          console.error('WebSocket error:', error);
        };
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
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = 'Status: Not Connected';
  }

  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();
