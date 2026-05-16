/*
  TerraBot ESP32 Controller - FIXED VERSION v2
  =============================================
  
  This Arduino sketch connects ESP32 to the TerraBot Python server
  via WiFi WebSocket and handles:
  - Receiving direction commands from web
  - Sending encoder data during mapping (every 100ms)
  - Running detection with sensor readings
  - Sending "Done" signal with all sensor data
  
  Hardware Requirements:
    - ESP32 development board
    - Motor encoders connected to GPIO pins
    - Motor driver (L298N or similar)
    - DHT22 temperature/humidity sensor (optional)
    - Soil moisture sensor (optional)
    
  Libraries Required:
    - WiFi.h (built-in)
    - WebSocketsClient.h (install via Library Manager: "WebSockets" by Markus Sattler)
    - ArduinoJson.h (install via Library Manager)
    - DHT.h (optional - install via Library Manager: "DHT sensor library" by Adafruit)
  
  Configuration:
    Update WIFI_SSID, WIFI_PASSWORD, and SERVER_IP below
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// Uncomment if using DHT sensor
// #include <DHT.h>

// ==================== CONFIGURATION ====================

// WiFi credentials - UPDATE THESE!
const char* WIFI_SSID = "";
const char* WIFI_PASSWORD = "";

// Python server IP - UPDATE THIS!
// Run "ipconfig" (Windows) or "ifconfig" (Mac/Linux) on your computer to find it
const char* SERVER_IP = "LAPTOP_IP";
const int SERVER_PORT = 8765;

// Device name (will appear in the web app)
const char* DEVICE_NAME = "TerraBot_1";

// ==================== PIN DEFINITIONS ====================

// Encoder pins
#define ENCODER_A_PIN 34
#define ENCODER_B_PIN 35

// Motor driver pins (L298N)
#define MOTOR_ENA 25
#define MOTOR_IN1 26
#define MOTOR_IN2 27
#define MOTOR_IN3 32
#define MOTOR_IN4 33
#define MOTOR_ENB 14

// Sensor pins
#define DHT_PIN 4
#define SOIL_MOISTURE_PIN 36

// Motor speed (0-255)
#define MOTOR_SPEED 200

// ==================== SENSOR SETUP ====================

// Uncomment if using DHT sensor
// #define DHTTYPE DHT22
// DHT dht(DHT_PIN, DHTTYPE);

// ==================== GLOBAL VARIABLES ====================

WebSocketsClient webSocket;

// Encoder variables
volatile long encoderCount = 0;
volatile long lastEncoderCount = 0;

// State variables
bool isConnected = false;
bool isMapping = false;
bool isDetecting = false;
String currentDirection = "stop";

// Timing
unsigned long lastEncoderSendTime = 0;
unsigned long lastSensorSendTime = 0;
const unsigned long ENCODER_SEND_INTERVAL = 100;  // Send encoder data every 100ms
const unsigned long SENSOR_SEND_INTERVAL = 2000;  // Send sensor data every 2s during detection

// Detection map data
struct WaypointData {
  String direction;
  int encoderTarget;
};
WaypointData detectionWaypoints[500];  // Store up to 500 waypoints
int mapDataCount = 0;
int currentWaypoint = 0;
long waypointStartEncoder = 0;

// Sensor values
float temperature = 24.5;
float humidity = 65.0;
float soilMoisture = 42.0;
int totalPlants = 0;

// Disease detection (simulated - replace with ML model)
struct Disease {
  String name;
  int count;
};
Disease detectedDiseases[10];
int diseaseCount = 0;

// ==================== ENCODER INTERRUPT ====================

void IRAM_ATTR encoderISR() {
  // Simple encoder counting - direction based on B channel
  if (digitalRead(ENCODER_B_PIN) == HIGH) {
    encoderCount++;
  } else {
    encoderCount--;
  }
}

// ==================== MOTOR CONTROL ====================

void stopMotors() {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(MOTOR_IN3, LOW);
  digitalWrite(MOTOR_IN4, LOW);
  analogWrite(MOTOR_ENA, 0);
  analogWrite(MOTOR_ENB, 0);
}

void moveForward() {
  digitalWrite(MOTOR_IN1, HIGH);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(MOTOR_IN3, HIGH);
  digitalWrite(MOTOR_IN4, LOW);
  analogWrite(MOTOR_ENA, MOTOR_SPEED);
  analogWrite(MOTOR_ENB, MOTOR_SPEED);
}

void moveBackward() {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, HIGH);
  digitalWrite(MOTOR_IN3, LOW);
  digitalWrite(MOTOR_IN4, HIGH);
  analogWrite(MOTOR_ENA, MOTOR_SPEED);
  analogWrite(MOTOR_ENB, MOTOR_SPEED);
}

void turnLeft() {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, HIGH);
  digitalWrite(MOTOR_IN3, HIGH);
  digitalWrite(MOTOR_IN4, LOW);
  analogWrite(MOTOR_ENA, MOTOR_SPEED);
  analogWrite(MOTOR_ENB, MOTOR_SPEED);
}

void turnRight() {
  digitalWrite(MOTOR_IN1, HIGH);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(MOTOR_IN3, LOW);
  digitalWrite(MOTOR_IN4, HIGH);
  analogWrite(MOTOR_ENA, MOTOR_SPEED);
  analogWrite(MOTOR_ENB, MOTOR_SPEED);
}

void setDirection(String direction) {
  currentDirection = direction;
  
  if (direction == "forward") {
    moveForward();
  } else if (direction == "backward") {
    moveBackward();
  } else if (direction == "left") {
    turnLeft();
  } else if (direction == "right") {
    turnRight();
  } else {
    stopMotors();
  }
  
  Serial.println("[Motor] Direction: " + direction);
}

// ==================== SENSOR READING ====================

void readSensors() {
  // Read temperature and humidity
  // Uncomment if using real DHT sensor:
  // float t = dht.readTemperature();
  // float h = dht.readHumidity();
  // if (!isnan(t)) temperature = t;
  // if (!isnan(h)) humidity = h;
  
  // For demo, simulate slight variations
  temperature = 24.5 + random(-20, 20) / 10.0;
  humidity = 65.0 + random(-50, 50) / 10.0;
  
  // Read soil moisture (analog)
  // int soilRaw = analogRead(SOIL_MOISTURE_PIN);
  // soilMoisture = map(soilRaw, 4095, 0, 0, 100);  // Convert to percentage
  
  // For demo, simulate
  soilMoisture = 42.0 + random(-50, 50) / 10.0;
}

void simulateDiseaseDetection() {
  // Simulate disease detection (replace with actual ML model)
  totalPlants++;
  
  // Random chance of detecting diseases
  if (random(100) < 15) {  // 15% chance
    int diseaseType = random(3);
    String diseaseName;
    
    switch (diseaseType) {
      case 0: diseaseName = "Early Blight"; break;
      case 1: diseaseName = "Late Blight"; break;
      case 2: diseaseName = "Leaf Spot"; break;
    }
    
    // Check if disease already in list
    bool found = false;
    for (int i = 0; i < diseaseCount; i++) {
      if (detectedDiseases[i].name == diseaseName) {
        detectedDiseases[i].count++;
        found = true;
        break;
      }
    }
    
    if (!found && diseaseCount < 10) {
      detectedDiseases[diseaseCount].name = diseaseName;
      detectedDiseases[diseaseCount].count = 1;
      diseaseCount++;
    }
    
    Serial.println("[Detection] Found: " + diseaseName);
  }
}

// ==================== WEBSOCKET HANDLERS ====================

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      isConnected = false;
      isMapping = false;
      isDetecting = false;
      stopMotors();
      break;
      
    case WStype_CONNECTED:
      Serial.println("[WS] Connected to server");
      isConnected = true;
      
      // Register as ESP32 device
      {
        StaticJsonDocument<200> regDoc;
        regDoc["type"] = "esp32_register";
        regDoc["name"] = DEVICE_NAME;
        
        String regMessage;
        serializeJson(regDoc, regMessage);
        webSocket.sendTXT(regMessage);
      }
      
      Serial.println("[WS] Registered as: " + String(DEVICE_NAME));
      break;
      
    case WStype_TEXT:
      handleServerMessage(payload, length);
      break;
      
    case WStype_ERROR:
      Serial.println("[WS] Error");
      break;
  }
}

void handleServerMessage(uint8_t* payload, size_t length) {
  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  
  if (error) {
    Serial.println("[WS] JSON parse error: " + String(error.c_str()));
    return;
  }
  
  String msgType = doc["type"].as<String>();
  Serial.println("[WS] Received: " + msgType);
  
  if (msgType == "start_mapping") {
    isMapping = true;
    isDetecting = false;
    encoderCount = 0;
    lastEncoderCount = 0;
    Serial.println("[Mapping] Started: " + mapName);
    
  } else if (msgType == "stop_mapping") {
    String mapName = doc["mapName"].as<String>();
    isMapping = false;
    stopMotors();
    Serial.println("[Mapping] Stopped");
    
  } else if (msgType == "direction") {
    // CRITICAL: Receive direction command from web and execute
    String direction = doc["direction"].as<String>();
    setDirection(direction);
    
  } else if (msgType == "start_detection") {
    isMapping = false;
    isDetecting = true;
    
    // Reset detection state
    totalPlants = 0;
    diseaseCount = 0;
    currentWaypoint = 0;
    
    // Parse map data
    JsonArray mapData = doc["mapData"].as<JsonArray>();
    mapDataCount = 0;
    
    for (JsonVariant v : mapData) {
      if (mapDataCount < 500) {
        detectionWaypoints[mapDataCount].direction = v["direction"].as<String>();
        detectionWaypoints[mapDataCount].encoderTarget = v["value"].as<int>();
        mapDataCount++;
      }
    }
    
    String crop = doc["crop"].as<String>();
    Serial.println("[Detection] Started for " + crop + " with " + String(mapDataCount) + " waypoints");
    
    // Start replaying the map
    if (mapDataCount > 0) {
      executeNextWaypoint();
    } else {
      // No waypoints, finish immediately
      finishDetection();
    }
    
  } else if (msgType == "web_connected") {
    Serial.println("[WS] Web client connected to this device");
  }
}

// ==================== DETECTION MAP REPLAY ====================

void executeNextWaypoint() {
  if (currentWaypoint >= mapDataCount) {
    // Detection complete
    finishDetection();
    return;
  }
  
  WaypointData wp = detectionWaypoints[currentWaypoint];
  
  Serial.println("[Waypoint] " + String(currentWaypoint + 1) + "/" + String(mapDataCount) + 
                 ": " + wp.direction + " for " + String(wp.encoderTarget) + " ticks");
  
  // Send progress to web
  sendReplayProgress();
  
  // Reset encoder for this waypoint
  waypointStartEncoder = encoderCount;
  
  // Set direction and wait for encoder to reach target
  setDirection(wp.direction);
  
  currentWaypoint++;
}

void checkWaypointProgress() {
  if (!isDetecting || currentWaypoint == 0) return;
  
  WaypointData wp = detectionWaypoints[currentWaypoint - 1];
  int encoderTarget = abs(wp.encoderTarget);
  long encoderDelta = abs(encoderCount - waypointStartEncoder);
  
  if (encoderDelta >= encoderTarget) {
    stopMotors();
    
    // Read sensors at this point
    readSensors();
    simulateDiseaseDetection();
    
    // Send sensor data
    sendSensorData();
    
    // Short delay
    delay(300);
    
    // Move to next waypoint
    executeNextWaypoint();
  }
}

void sendReplayProgress() {
  StaticJsonDocument<200> doc;
  doc["type"] = "replay_progress";
  doc["current"] = currentWaypoint;
  doc["total"] = mapDataCount;
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
}

void finishDetection() {
  isDetecting = false;
  stopMotors();
  
  // Final sensor read
  readSensors();
  
  Serial.println("[Detection] Complete!");
  Serial.println("[Detection] Total plants: " + String(totalPlants));
  Serial.println("[Detection] Diseases found: " + String(diseaseCount));
  
  // Send final "done" message with all data
  StaticJsonDocument<1024> doc;
  doc["type"] = "done";
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["soilMoisture"] = soilMoisture;
  doc["totalPlants"] = totalPlants;
  
  JsonObject diseases = doc.createNestedObject("diseases");
  for (int i = 0; i < diseaseCount; i++) {
    diseases[detectedDiseases[i].name] = detectedDiseases[i].count;
  }
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
  
  Serial.println("[WS] Sent 'done' message with sensor data");
}

// ==================== DATA SENDING ====================

void sendEncoderData() {
  // Only send encoder data when mapping AND moving
  if (!isMapping || currentDirection == "stop") {
    return;
  }
  
  unsigned long currentTime = millis();
  
  if (currentTime - lastEncoderSendTime >= ENCODER_SEND_INTERVAL) {
    lastEncoderSendTime = currentTime;
    
    // Get encoder delta since last send
    long encoderDelta = encoderCount - lastEncoderCount;
    lastEncoderCount = encoderCount;
    
    // Only send if there's actual movement
    if (encoderDelta != 0) {
      StaticJsonDocument<200> doc;
      doc["type"] = "encoder";
      doc["direction"] = currentDirection;
      doc["value"] = encoderDelta;
      doc["timestamp"] = currentTime;
      
      String message;
      serializeJson(doc, message);
      webSocket.sendTXT(message);
      
      Serial.println("[Encoder] Sent: " + currentDirection + " = " + String(encoderDelta));
    }
  }
}

void sendSensorData() {
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["soilMoisture"] = soilMoisture;
  doc["totalPlants"] = totalPlants;
  
  JsonObject diseases = doc.createNestedObject("diseases");
  for (int i = 0; i < diseaseCount; i++) {
    diseases[detectedDiseases[i].name] = detectedDiseases[i].count;
  }
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT(message);
  
  Serial.println("[Sensor] Sent data to server");
}

// ==================== WIFI CONNECTION ====================

void connectWiFi() {
  Serial.println("[WiFi] Connecting to: " + String(WIFI_SSID));
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WiFi] Connected!");
    Serial.println("[WiFi] IP: " + WiFi.localIP().toString());
  } else {
    Serial.println();
    Serial.println("[WiFi] Connection failed!");
  }
}

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n========================================");
  Serial.println("TerraBot ESP32 Controller - FIXED v2");
  Serial.println("========================================\n");
  
  // Setup encoder pins
  pinMode(ENCODER_A_PIN, INPUT_PULLUP);
  pinMode(ENCODER_B_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_A_PIN), encoderISR, RISING);
  
  // Setup motor pins
  pinMode(MOTOR_ENA, OUTPUT);
  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(MOTOR_IN3, OUTPUT);
  pinMode(MOTOR_IN4, OUTPUT);
  pinMode(MOTOR_ENB, OUTPUT);
  
  // Setup sensor pins
  pinMode(SOIL_MOISTURE_PIN, INPUT);
  
  // Initialize DHT sensor if using
  // dht.begin();
  
  stopMotors();
  
  // Connect to WiFi
  connectWiFi();
  
  // Connect to WebSocket server
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WS] Connecting to: " + String(SERVER_IP) + ":" + String(SERVER_PORT));
    webSocket.begin(SERVER_IP, SERVER_PORT, "/");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
  }
  
  Serial.println("\n[Ready] Waiting for commands...\n");
}

// ==================== MAIN LOOP ====================

void loop() {
  // Handle WebSocket
  webSocket.loop();
  
  // Send encoder data if mapping
  if (isMapping && isConnected) {
    sendEncoderData();
  }
  
  // Check waypoint progress during detection
  if (isDetecting && isConnected) {
    checkWaypointProgress();
  }
  
  // Reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection, reconnecting...");
    stopMotors();
    isMapping = false;
    isDetecting = false;
    connectWiFi();
    
    if (WiFi.status() == WL_CONNECTED) {
      webSocket.begin(SERVER_IP, SERVER_PORT, "/");
    }
  }
  
  delay(10);
}
