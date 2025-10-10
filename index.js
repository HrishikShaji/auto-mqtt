const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// MQTT settings (WSS)
const broker = 'wss://mqtt-broker-z9f6.onrender.com';
const topic = 'trailer/data';
const cacheFile = 'cached_data.json';
let connected = false;
let cachedData = [];
let client = null;

// Set up logging helper
function log(level, message, ...args) {
	const timestamp = new Date().toISOString();
	const formattedMessage = args.length > 0 ?
		message.replace(/%s|%d/g, () => args.shift()) :
		message;
	console.log(`${timestamp} - ${level} - ${formattedMessage}`);
}

// Load cached data from file
function loadCachedData() {
	if (fs.existsSync(cacheFile)) {
		try {
			const data = fs.readFileSync(cacheFile, 'utf8');
			cachedData = JSON.parse(data);
			log('INFO', `Loaded ${cachedData.length} cached data entries`);
		} catch (err) {
			log('ERROR', `Failed to load cached data: ${err.message}`);
			cachedData = [];
		}
	} else {
		cachedData = [];
	}
}

// Save cached data to file
function saveCachedData() {
	try {
		fs.writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2));
		log('DEBUG', `Saved cached data: ${cachedData.length} entries`);
	} catch (err) {
		log('ERROR', `Failed to save cached data: ${err.message}`);
	}
}

// Generate synthetic trailer data
function generateSyntheticData() {
	const now = new Date();

	const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
	const randomFloat = (min, max, decimals = 1) =>
		parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
	const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

	return {
		timestamp: now.toISOString(),
		battery: {
			current_level: randomInt(0, 100),
			voltage: randomFloat(120, 140, 1),
			current_draw: randomFloat(12.5, 35, 1),
			temperature: randomFloat(32, 125, 1),
			cycles: randomInt(1000, 1500),
			health: randomChoice(['Excellent', 'Good', 'Fair', 'Poor']),
			last_charged: randomChoice(['1 hour ago', '2 hours ago', '3 hours ago', '4 hours ago']),
			estimated_runtime: `${randomInt(10, 24)} hours`,
			charging_status: randomChoice(['Charging', 'Not charging', 'Full'])
		},
		lighting: {
			overall_brightness: `${randomInt(0, 100)}%`,
			interior_lights: randomChoice(['On (100%)', 'Off (0%)', 'Dim (50%)']),
			exterior_lights: randomChoice(['On (100%)', 'Off (0%)', 'Auto (60%)']),
			work_lights: randomChoice(['On', 'Off']),
			emergency_lights: randomChoice(['Standby', 'Active']),
			power_consumption: `${randomInt(100, 300)}W`,
			led_health: `${randomInt(80, 100)}%`,
			schedule: randomChoice(['Auto sunset/sunrise', 'Manual', 'Off'])
		},
		security: {
			system_status: randomChoice(['Armed', 'Disarmed']),
			active_cameras: `${randomInt(0, 4)} of 4`,
			motion_detection: randomChoice(['Active', 'Inactive']),
			door_status: randomChoice(['All locked', 'Front unlocked']),
			window_status: 'All secure',
			alarm_history: 'No recent alerts',
			access_log: `${randomInt(0, 5)} entries today`,
			remote_access: randomChoice(['Enabled', 'Disabled'])
		},
		water: {
			fresh_water: `${randomInt(0, 100)}% (${randomInt(100, 200)}L)`,
			gray_water: `${randomInt(0, 100)}% (${randomInt(0, 100)}L)`,
			water_pressure: `${randomInt(30, 60)} PSI`,
			water_temperature: `${randomInt(60, 80)}°F`,
			pump_status: randomChoice(['Auto', 'Manual', 'Off']),
			filter_status: `Good -${randomInt(80, 100)}%`,
			daily_usage: `${randomInt(20, 80)}L`,
			leak_detection: 'No leaks detected'
		},
		network: {
			wifi_status: randomChoice(['Connected', 'Disconnected']),
			signal_strength: `${randomInt(-90, -40)} dBm (${randomChoice(['Excellent', 'Good', 'Fair', 'Poor'])})`,
			bandwidth: `${randomInt(50, 200)} Mbps down / ${randomInt(10, 100)} Mbps up`,
			data_usage: `${randomFloat(0.5, 5.0, 1)} GB today`,
			cellular_signal: `${randomInt(1, 4)} bars (${randomChoice(['LTE', '5G'])})`,
			satellite_backup: randomChoice(['Available', 'Unavailable']),
			connected_devices: randomInt(5, 15),
			network_security: 'WPA3 Encrypted'
		},
		climate: {
			interior_temperature: `${randomInt(60, 80)}°F`,
			target_temperature: `${randomInt(65, 85)}°F`,
			humidity: `${randomInt(30, 70)}%`,
			hvac_mode: randomChoice(['Auto', 'Cool', 'Heat', 'Off']),
			fan_speed: `${randomChoice([1, 2, 3, 4])} (Medium)`,
			air_quality: randomChoice(['Good', 'Fair', 'Poor']),
			filter_status: randomChoice(['Clean', 'Replace soon']),
			energy_usage: `${randomFloat(0.5, 2.0, 1)} kW/h`
		},
		vehicle: {
			vehicle_id: 'TR-2024-003',
			make_model: 'Winnebago Studio Series Pro',
			year: 2023,
			vin: '1FDWE3FL6DDA12347',
			license_plate: 'STU003B',
			mileage: `${randomInt(10000, 20000)} miles`,
			last_service: 'January 15, 2024',
			next_service: 'April 15, 2024',
			insurance_expires: 'December 31, 2024',
			registration_expires: 'March 31, 2025',
			dimensions: "53' L × 8.5' W × 13.6' H",
			weight: `${randomInt(30000, 35000)} lbs`,
			capacity: '12 people',
			generator: '60kW Diesel Backup',
			electrical: '400A 3-Phase Hookup'
		}
	};
}

// Connect to MQTT broker
function connectToBroker() {
	log('INFO', 'Attempting to connect to MQTT broker...');

	client = mqtt.connect(broker, {
		rejectUnauthorized: false, // Disable cert verification (similar to Python's CERT_NONE)
		keepalive: 60,
		reconnectPeriod: 5000
	});

	// Connection successful
	client.on('connect', () => {
		connected = true;
		log('INFO', 'Connected to MQTT broker');

		// Publish cached data on reconnect
		if (cachedData.length > 0) {
			cachedData.forEach(entry => {
				client.publish(topic, JSON.stringify(entry));
				log('INFO', 'Published cached data entry');
			});
			cachedData = [];
			saveCachedData();
		}
	});

	// Connection error
	client.on('error', (err) => {
		log('ERROR', `MQTT error: ${err.message}`);
		console.log('ALERT: MQTT broker not available. Caching data locally...');
	});

	// Disconnection
	client.on('disconnect', () => {
		connected = false;
		log('WARNING', 'Disconnected from MQTT broker');
		console.log('ALERT: MQTT connection lost. Caching future data...');
	});

	// Offline
	client.on('offline', () => {
		connected = false;
		log('WARNING', 'MQTT client is offline');
	});

	// Reconnecting
	client.on('reconnect', () => {
		log('INFO', 'Attempting to reconnect to MQTT broker...');
	});
}

// Publish data
function publishData() {
	const data = generateSyntheticData();
	const payload = JSON.stringify(data);

	if (connected && client) {
		client.publish(topic, payload, (err) => {
			if (err) {
				log('ERROR', `Publish failed: ${err.message}`);
				// Cache the data if publish fails
				cachedData.push(data);
				saveCachedData();
			} else {
				log('INFO', 'Published data successfully');
				log('INFO', `Sent data: ${payload}`);
			}
		});
	} else {
		// Cache the data
		cachedData.push(data);
		saveCachedData();
		log('INFO', `MQTT unavailable - cached data (total: ${cachedData.length} entries)`);
		console.log('ALERT: MQTT server not available. Data cached locally.');
	}
}

// Main execution
log('INFO', 'Edge device simulator started. Publishing synthetic trailer data every 10 seconds...');

// Load initial cache
loadCachedData();

// Connect to broker
connectToBroker();

// Publish data every 10 seconds
const publishInterval = setInterval(publishData, 10000);

// Handle graceful shutdown
process.on('SIGINT', () => {
	log('INFO', 'Shutting down...');
	clearInterval(publishInterval);
	if (client) {
		client.end();
	}
	saveCachedData();
	process.exit(0);
});

process.on('SIGTERM', () => {
	log('INFO', 'Shutting down...');
	clearInterval(publishInterval);
	if (client) {
		client.end();
	}
	saveCachedData();
	process.exit(0);
});
