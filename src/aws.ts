export type PolicyDocument = {
	Version: string,
	Statement: {
		Action: string[],
		Effect: string,
		Principal?: { AWS: string },
		Resource?: string[],
	}[],
};
