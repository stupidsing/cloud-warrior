export type Class = {
	class_: string;
	delete_: (state: any) => string[];
	getKey: (resource: Resource) => string;
	refresh: (state: any) => string[];
	upsert: (state: any, resource: Resource) => string[];
};

export type Resource_<Attributes> = {
	class_: string;
	name: string;
	hash: string;
	attributes: Attributes;

	key?: string;
};

export type Resource = Resource_<Record<string, any>>;

export type AttributesInput<Attributes> = (get: (referredResource: Resource, prop: string) => string) => Attributes;
