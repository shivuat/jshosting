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

  // Create and style the secret key input box
  var secretKeyInput = document.createElement('input');
  secretKeyInput.type = 'text';
  secretKeyInput.id = 'secretKey';
  secretKeyInput.placeholder = 'Enter OpenAI API Key';
  secretKeyInput.style = 'margin-left: 5px; padding: 5px; border: 1px solid black; border-radius: 3px;';
  controlsDiv.appendChild(secretKeyInput);

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

  // JavaScript for handling recording and WebSocket connection
  let mediaRecorder;
  let socket;
  let fullTranscript = '';

  function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      socket = new WebSocket('wss://api.deepgram.com/v1/listen?diarize=true&smart_format=true&redact=pci&redact=ssn&model=nova-2', ['token', 'bf373551459bce132cef3b1b065859ed3e4bac8f']);

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
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcript = received.channel.alternatives[0].transcript;
        const words = received.channel.alternatives[0].words;

        if (transcript && received.is_final) {
          let transcriptText = '';
          let currentSpeaker = null;
          words.forEach(word => {
            if (word.speaker !== currentSpeaker) {
              if (currentSpeaker !== null) {
                transcriptText += '\n';
              }
              currentSpeaker = word.speaker;
              transcriptText += `[Speaker ${currentSpeaker}] `;
            }
            transcriptText += `${word.punctuated_word} `;
          });
          fullTranscript += transcriptText.trim() + '\n';
          transcriptDiv.textContent += transcriptText.trim() + '\n';
        }
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

    // Prompt for API key and proceed button
    const promptDiv = document.createElement('div');
    promptDiv.id = 'prompt';
    promptDiv.style = 'margin-top: 10px; padding: 5px; border: 1px solid black; border-radius: 3px;';
    promptDiv.innerHTML = `
      <label for="apiKeyInput">Enter OpenAI API Key:</label>
      <input type="text" id="apiKeyInput" placeholder="API Key" style="margin-left: 5px; padding: 5px; border: 1px solid black; border-radius: 3px;">
      <button id="proceedButton" style="margin-left: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Proceed</button>
    `;
    resultsDiv.appendChild(promptDiv);

    document.getElementById('proceedButton').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKeyInput').value;
      if (!apiKey) {
        alert('Please enter the OpenAI API key');
        return;
      }

      // Call OpenAI API to get summarization
      const analysisResults = await callOpenAiAPI(fullTranscript, apiKey);

      // Display results
      displayResults(analysisResults);

      // Remove prompt
      promptDiv.remove();
    });
  }

  // Function to call OpenAI API with retry mechanism
  async function callOpenAiAPI(transcript, apiKey, retryCount = 3) {
    const maxLength = 4096; // Maximum token length for the model

    // Trim the transcript if it's too long
    if (transcript.length > maxLength) {
      transcript = transcript.substring(0, maxLength);
    }

    try {
      // Summarization
      const summary = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, retryCount, 'summary');
      displayPartialResult('Summary', summary);

      return {
        summary
      };
    } catch (error) {
      console.error('Error during OpenAI API calls:', error);
      return { error: 'Error during OpenAI API calls: ' + error.message };
    }
  }

  // Function to call a specific OpenAI endpoint with retry
  async function callOpenAiEndpoint(url, transcript, apiKey, retries, type) {
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: `Summarize the following conversation:\n\n${transcript}\n\nSummary:` }
        ],
        max_tokens: 150,
        n: 1,
        stop: ['\n']
      })
    };

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        const data = await response.json();
        if (response.ok) {
          return data.choices[0].message.content.trim();
        } else {
          console.error('Fetch failed:', data);
          throw new Error('Fetch failed');
        }
      } catch (error) {
        if (i === retries - 1) {
          console.error('Maximum retries reached:', error);
          throw error;
        }
        console.log(`Retrying (${i + 1}/${retries})...`);
        await new Promise(res => setTimeout(res, 2000));
      }
    }
  }

  // Function to display partial results
  function displayPartialResult(title, result) {
    const resultBox = document.createElement('div');
    resultBox.style = 'border: 1px solid black; padding: 5px; margin-top: 5px;';
    const resultTitle = document.createElement('h4');
    resultTitle.textContent = title;
    const resultContent = document.createElement('p');
    resultContent.textContent = result;

    resultBox.appendChild(resultTitle);
    resultBox.appendChild(resultContent);
    resultsDiv.appendChild(resultBox);
  }

  // Function to display results
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
      resultsBox.appendChild(summaryContent);
    }

    resultsDiv.appendChild(resultsBox);
  }

  // Add event listeners to the buttons
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();
