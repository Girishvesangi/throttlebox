export type Policy={
    algorithm:'fixed_window';
    limit:number;
    windowMs: number;
};

export const policies: Record<string,Policy>={
    'login-attempts':{algorithm:'fixed_window',limit:5,windowMs:60_000},
    'api-default':{algorithm:'fixed_window',limit:100,windowMs:60_000},
};