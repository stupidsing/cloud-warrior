export let difference = (a: Set<string>, b: Set<string>) => {
	let result = new Set(a);
	b.forEach(value => result.delete(value));
	return result;
};
