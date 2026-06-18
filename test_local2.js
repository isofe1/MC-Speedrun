import handler from './api/runs.js';

const mockReq = {
    query: {
        seedType: 'set',
        version: 'lx5oek31'
    }
};

const mockRes = {
    setHeader: (name, value) => {
        console.log(`Setting header: ${name} = ${value}`);
    },
    status: (statusCode) => {
        console.log(`Setting status: ${statusCode}`);
        return {
            json: (data) => {
                console.log(`Sending JSON: ${JSON.stringify(data).substring(0, 100)}...`);
            }
        };
    }
};

async function test() {
    await handler(mockReq, mockRes);
}

test();
