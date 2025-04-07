export let difference = (a: Set<string>, b: Set<string>) => {
	let result = new Set(a);
	b.forEach(value => result.delete(value));
	return result;
};

export let dump = o => {
	let dump_ = (prefix, o) => {
		if (typeof o === 'object') {
			return Object.keys(o).flatMap(key => dump_(`${prefix}.${key}`, o[key]));
		} else {
			return [`${prefix} = ${o}`];
		}
	};
	return dump_('', o).sort().join('\n');
};

export let equals = (a, b) => {
	if (a === b)
		return true;
	else {
		let ta = typeof a;
		let tb = typeof b;

		if (ta === tb) {
			if (typeof a.length === 'number') {
				if (a.length === b.length) {
					if (typeof a[0] === 'string') {
						a = a.toSorted();
						b = b.toSorted();
					}

					let b_ = true;
					for (let i = 0; i < a.length; i++) b_ &&= equals(a[i], b[i]);
					return b_;
				} else {
					return false;
				}
			} else if (ta === 'object') {
				let keys = new Set();
				for (let key of Object.keys(a)) keys.add(key);
				for (let key of Object.keys(b)) keys.add(key);
				let b_ = true;
				keys.forEach((key: any) => b_ &&= equals(a[key], b[key]));
				return b_;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}
};

export let replace = (s: string) => {
	if (s.startsWith('$(') && s.endsWith(')')) {
		s = s.substring(0, s.length - 1) + ' | tr / :' + s.substring(s.length - 1, s.length);
	}

	let t = '';
	let q = 0;
	for (let c of s) {
		if (c === '(') q++;
		else if (c === ')') q--;
		if (q === 0 && c === '/') {
			t = t + ':';
		} else {
			t = t + c;
		}
	}

	return t;
};

export let shellEscape = s => {
	return `"${s.replaceAll('"', '\\"')}"`;
};
