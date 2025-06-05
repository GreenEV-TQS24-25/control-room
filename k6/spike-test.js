import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// Métricas customizadas para diferentes categorias de endpoints
const publicStationsMetrics = {
  responseTime: new Trend("public_stations_response_time"),
  errorRate: new Rate("public_stations_error_rate"),
};

const authMetrics = {
  responseTime: new Trend("auth_response_time"),
  errorRate: new Rate("auth_error_rate"),
};

const vehicleMetrics = {
  responseTime: new Trend("vehicle_response_time"),
  errorRate: new Rate("vehicle_error_rate"),
};

const sessionMetrics = {
  responseTime: new Trend("session_response_time"),
  errorRate: new Rate("session_error_rate"),
};

const paymentMetrics = {
  responseTime: new Trend("payment_response_time"),
  errorRate: new Rate("payment_error_rate"),
};

export const options = {
  stages: [
    { duration: "20s", target: 25 },
    { duration: "40s", target: 35 },
    { duration: "20s", target: 50 },
    { duration: "20s", target: 0 },
  ],
  thresholds: {
    "http_req_duration{category:public}": ["p(95)<800"],
    "http_req_duration{category:auth}": ["p(95)<1200"],
    "http_req_duration{category:vehicle}": ["p(95)<1000"],
    "http_req_duration{category:session}": ["p(95)<1500"],
    http_req_failed: ["rate<0.05"],
    public_stations_error_rate: ["rate<0.03"],
    auth_error_rate: ["rate<0.02"],
    vehicle_error_rate: ["rate<0.04"],
    session_error_rate: ["rate<0.06"],
  },
};

const BASE_URL = "http://backend:8001";
let authToken = "";
let testUserId = "";
let stationIds = [];
let vehicleIds = [];

export function setup() {
  // 1. Criar usuário de teste
  const testUser = {
    name: `LoadTestUser_${Date.now()}`,
    email: `loadtest_${Date.now()}@example.com`,
    password: "TestPassword123!",
  };

  const createRes = http.post(
    `${BASE_URL}/api/v1/public/user-table`,
    JSON.stringify(testUser),
    { headers: { "Content-Type": "application/json" } }
  );

  if (!check(createRes, { "User created": (r) => r.status === 201 })) {
    throw new Error("Failed to create test user");
  }

  // 2. Fazer login para obter token
  const loginRes = http.post(
    `${BASE_URL}/api/v1/public/user-table/login`,
    JSON.stringify({ email: testUser.email, password: testUser.password }),
    { headers: { "Content-Type": "application/json" } }
  );

  if (!check(loginRes, { "Login successful": (r) => r.status === 200 })) {
    throw new Error("Failed to login");
  }

  authToken = loginRes.json().token;
  testUserId = loginRes.json().id;

  // 3. Coletar dados necessários para os testes
  const stationsRes = http.get(
    `${BASE_URL}/api/v1/public/charging-stations/all`
  );
  if (check(stationsRes, { "Stations fetched": (r) => r.status === 200 })) {
    stationIds = stationsRes
      .json()
      .map((s) => s.chargingStation?.id)
      .filter((id) => id);
  }

  // 4. Criar veículo de teste
  const vehiclePayload = {
    brand: "Tesla",
    model: "Model S",
    licensePlate: `TEST_${Math.floor(Math.random() * 100000)}`,
    connectorType: "CCS",
  };

  const vehicleRes = http.post(
    `${BASE_URL}/api/v1/private/vehicles`,
    JSON.stringify(vehiclePayload),
    { headers: getAuthHeaders(authToken) }
  );

  if (check(vehicleRes, { "Vehicle created": (r) => r.status === 200 })) {
    vehicleIds.push(vehicleRes.json().id);
  }

  return { authToken, stationIds, vehicleIds, testUserId };
}

function getAuthHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export default function (data) {
  const { authToken, stationIds, vehicleIds } = data;
  const headers = getAuthHeaders(authToken);
  // Distribuição de cenários
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40%: Operações públicas
    testPublicEndpoints(stationIds);
  } else if (scenario < 0.7) {
    // 30%: Gestão de veículos
    testVehicleOperations(headers, vehicleIds);
  } else if (scenario < 0.9) {
    // 20%: Gestão de sessões
    testSessionOperations(headers, stationIds);
  } else {
    // 10%: Pagamentos

    ("TODO");
    // testPaymentOperations(headers);
  }

  // sleep(Math.random() * 1 + 0.5);
}

function testPublicEndpoints(stationIds) {
  if (Math.random() < 0.7) {
    // Listar todas as estações
    const res = http.get(`${BASE_URL}/api/v1/public/charging-stations/all`, {
      tags: { category: "public" },
    });

    publicStationsMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
      "response time": (r) => r.timings.duration < 2000,
    });
    publicStationsMetrics.errorRate.add(!success);
  } else {
    // Filtrar estações por tipo de conector
    const connectors = ["CCS", "CHADEMO", "MENNEKES", "SAEJ1772"];
    const res = http.get(
      `${BASE_URL}/api/v1/public/charging-stations/filter?connectorTypeInputs=${randomItem(
        connectors
      )}`,
      { tags: { category: "public" } }
    );

    publicStationsMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
      // "valid response": (r) => Array.isArray(r.json()),
    });
    publicStationsMetrics.errorRate.add(!success);
  }
}

function testVehicleOperations(headers, vehicleIds) {
  if (vehicleIds.length > 0 && Math.random() < 0.8) {
    // Operações CRUD em veículos existentes
    // const vehicleId = randomItem(vehicleIds);
    const res = http.get(`${BASE_URL}/api/v1/private/vehicles`, {
      headers,
      tags: { category: "vehicle" },
    });

    vehicleMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
    });
    vehicleMetrics.errorRate.add(!success);
  } else {
    // Criar novo veículo
    const payload = {
      brand: "TEST",
      model: "MUSK",
      licensePlate: `${Math.floor(Math.random() * 10000)}_${Math.floor(
        Math.random() * 100
      )}_${Math.floor(Math.random() * 100)}`,
      connectorType: randomItem(["CHADEMO", "CCS"]),
    };

    const res = http.post(
      `${BASE_URL}/api/v1/private/vehicles`,
      JSON.stringify(payload),
      { headers, tags: { category: "vehicle" } }
    );

    vehicleMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
      "vehicle created": (r) => r.json().id !== undefined,
    });
    vehicleMetrics.errorRate.add(!success);
  }
}

function testSessionOperations(headers, stationIds) {
  if (stationIds.length === 0) return;

  if (Math.random() < 0.6) {
    // Consultar sessões
    const res = http.get(`${BASE_URL}/api/v1/private/session`, {
      headers,
      tags: { category: "session" },
    });

    sessionMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
    });
    sessionMetrics.errorRate.add(!success);
  } else {
    // Buscar veículos do utilizador
    const vehiclesRes = http.get(`${BASE_URL}/api/v1/private/vehicles`, {
      headers,
      tags: { category: "vehicle" },
    });

    let vehicles = [];
    if (vehiclesRes.status === 200) {
      try {
        vehicles = vehiclesRes.json();
      } catch (e) {
        console.error("Erro ao fazer parse dos veículos:", vehiclesRes.body);
        return;
      }
    }
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      console.warn("Utilizador não tem veículos para criar sessão.");
      return;
    }

    const vehicle = randomItem(vehicles);
    const stationId = randomItem(stationIds);

    // Gerar uma data aleatória dentro dos próximos 60 dias, mas não hoje
    const now = new Date();
    const daysAhead = Math.floor(Math.random() * 60) + 1; // 1 a 60 dias à frente
    const randomFutureDate = new Date(
      now.getTime() + Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)
    );
    randomFutureDate.setDate(now.getDate() + daysAhead);

    const payload = {
      chargingSpot: { id: stationId },
      vehicle: { id: vehicle.id },
      startTime: randomFutureDate.toISOString(),
      duration: Math.floor(Math.random() * 1800) + 600, // Duração aleatória entre 10 e 30 minutos
    };

    const res = http.post(
      `${BASE_URL}/api/v1/private/session`,
      JSON.stringify(payload),
      { headers, tags: { category: "session" } }
    );

    if (res.status !== 200) {
      return;
    }

    sessionMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
      "session created": (r) => {
        return r.json().id !== undefined;
      },
    });
    sessionMetrics.errorRate.add(!success);
  }
}

function testPaymentOperations(headers) {
  // Criar sessão temporária para pagamento
  const sessionRes = http.post(
    `${BASE_URL}/api/v1/private/session`,
    JSON.stringify({
      chargingSpotId: randomItem(stationIds),
      vehicleId: randomItem(vehicleIds),
      startTime: new Date().toISOString(),
    }),
    { headers }
  );

  if (check(sessionRes, { "Session created": (r) => r.status === 200 })) {
    const sessionId = sessionRes.json().id;
    const res = http.post(
      `${BASE_URL}/api/v1/private/payment/create-intent/${sessionId}`,
      null,
      { headers, tags: { category: "payment" } }
    );

    paymentMetrics.responseTime.add(res.timings.duration);
    const success = check(res, {
      "status 200": (r) => r.status === 200,
      "payment intent created": (r) => r.json().clientSecret !== undefined,
    });
    paymentMetrics.errorRate.add(!success);
  }
}
