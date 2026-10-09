// Parameter vectors and source identity are included in portable archives.
export const FSRS7_DEFAULT = [0.1104,2.2395,3.9221,11.7841,6.1686,0.6457,3.6807,1.9795,0,1.3826,0.7024,0.5999,0.8146,0.6398,1,1.3207,0.6707,3.8668,0.4416,0.0934,1.8631,0.6162,1.0869,0.1567,0.0801,0.2421,0.9464,0.1433,0.7145,0,0.5667,0.3734,0.5333,0.3048];
export const FSRS6_DEFAULT = [0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];
export const ENGINE_INFO = {
  version: 'recall-memory-v1',
  source: {
    repository: 'https://github.com/open-spaced-repetition/fsrs-rs',
    commit: '4bc0a0979f95dd01cc653031b6f2a01429e4c32b',
    license: 'BSD-3-Clause',
  },
  models: {
    fsrs7: {name:'FSRS-7',implementation:'FSRS-7/rust-scalar-v1',defaultParameterId:'fsrs7-defaults-v1',defaultWeights:FSRS7_DEFAULT},
    fsrs6: {name:'FSRS-6',implementation:'FSRS-6',defaultParameterId:'fsrs6-defaults-v1',defaultWeights:FSRS6_DEFAULT},
    sm2: {name:'SM-2',implementation:'recall-sm2-v1',defaultParameterId:'sm2-defaults-v1'},
    leitner: {name:'Leitner',implementation:'recall-leitner-v1',defaultParameterId:'leitner-defaults-v1'},
  },
  scheduling: {elapsedUnit:'fractional-days',dayMilliseconds:86400000,minimumMinutesByRating:[1,6,10,30],maximumIntervalDays:36500},
  personalParameters: 'model.parameters events in events.json',
};
