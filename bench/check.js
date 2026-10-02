import http from 'k6/http';
import { check } from 'k6';

export const options ={
    scenarios:{
        checks:{
            executor:'constant-arrival-rate',
            rate:Number(__ENV.RATE||500),
            timeUnit:'1s',
            duration:__ENV.DURATION || '30s',
            preAllocatedVUs: 100,
            maxVUs:1000,
        },
    },
    thresholds:{
        http_req_failed:['rate<0.01'],
        http_req_duration:['p(95)<25','p(99)<75'],
    },
};

function subject(){
    const mode= __ENV.MODE || 'mixed';
    if(mode==='hot') return 'hot-user';
    if(mode==='skewed'){
        return Math.random()<0.9 ? `user-hot-${__ITER %10}` : `user-cold-${__ITER %1000}`;
          
    }
    return `user-${__VU}-${__ITER %1000}`;
}

export default function(){
    const res=http.post(
        `${__ENV.BASE_URL || 'http://localhost:3000'}/v1/check`,
        JSON.stringify({
            policyId: __ENV.POLICY_ID || 'api-burst',
            subject: subject(),
            cost:1,
        }),
        {headers:{'content-type':'application/json'}},
    );
    check(res,{
        'decision returned':(r)=> r.status===200,
        'valid body': (r) => r.status === 200 && typeof r.json('allowed') === 'boolean',

    });
}