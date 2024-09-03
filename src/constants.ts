export let prefix = 'npt-cloud';

export let dependenciesDirectory = '.warrior/dependencies';

export let stateDirectory = `.warrior/states`;

export let getStateFilename = key => `${stateDirectory}/${key}`;
