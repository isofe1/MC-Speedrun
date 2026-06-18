import handler from './api/runs.js';

const mockReq = {
    query: {
        seedType: 'set',
        version: '4qye4731' // 1.16-1.19
    }
};

const mockRes = {
    setHeader: (name, value) => { },
    status: (statusCode) => {
        return {
            json: (data) => {
                console.log(`Leaderboard size: ${data.leaderboard.length}`);
                if (data.leaderboard.length > 0) {
                    console.log(`First run time: ${data.leaderboard[0].time}`);
                }
            }
        };
    }
};

async function test() {
    await handler(mockReq, mockRes);
}

test();
