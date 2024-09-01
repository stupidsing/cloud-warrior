export type Class = {
	class_: string;
	delete_: (state: any, key: string) => string[];
	getKey: (resource: Resource) => string;
	refresh: (state: any, key: string) => string[];
	upsert: (state: any, resource: Resource) => string[];
};

export type Resource = {
	class_: string;
	name: string;
	attributes: Record<string, any>;

	key?: string;
};
