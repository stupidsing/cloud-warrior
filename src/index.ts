import { create, run } from './warrior';

run(() => {
	let vpc = create('vpc', 'a', get => ({
		CidrBlockAssociationSet: [{ CidrBlock: '10.88.0.0/16' }],
		EnableDnsHostnames: true,
		EnableDnsSupport: true,
	}));

	let subnetPublic = create('subnet', 'public', get => ({
		AvailabilityZone: 'ap-southeast-1a',
		CidrBlock: '10.88.1.0/24',
		MapPublicIpOnLaunch: true,
		VpcId: get(vpc, 'VpcId'),
	}));

	let subnetPrivate = create('subnet', 'private', get => ({
		AvailabilityZone: 'ap-southeast-1a',
		CidrBlock: '10.88.2.0/24',
		MapPublicIpOnLaunch: false,
		VpcId: get(vpc, 'VpcId'),
	}));

	let securityGroup = create('security-group', 'app', get => ({
		Description: '-',
		GroupName: 'sg-app',
		VpcId: get(vpc, 'VpcId'),
	}));

	let instance = create('instance', '0', get => ({
		ImageId: 'ami-05d6d0aae066c8d93', // aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id | jq -r .Parameter.Value
		InstanceType: 't3.nano',
		SecurityGroups: [get(securityGroup, 'GroupName')],
		SubnetId: get(subnetPrivate, 'SubnetId'),
	}));

	return [vpc, securityGroup, subnetPublic, subnetPrivate, instance];
});
