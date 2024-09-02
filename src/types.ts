export type Class = {
	class_: string;
	delete_: (state: any, key: string) => string[];
	getKey: (resource: Resource) => string;
	refresh: (state: any, key: string) => string[];
	upsert: (state: any, resource: Resource) => string[];
};

export type Resource_<Attributes> = {
	class_: string;
	name: string;
	attributes: Attributes;

	key?: string;
};

export type Resource = Resource_<Record<string, any>>;
