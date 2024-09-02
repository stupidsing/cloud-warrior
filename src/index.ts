import { createInstance } from './instance';
import { createSecurityGroup } from './securityGroup';
import { createSubnet } from './subnet';
import { createVpc } from './vpc';
import { run } from './warrior';

run(() => {
	let vpc = createVpc('a', get => ({
		CidrBlockAssociationSet: [{ CidrBlock: '10.88.0.0/16' }],
		EnableDnsHostnames: true,
		EnableDnsSupport: true,
	}));

	let subnetPublic = createSubnet('public', get => ({
		AvailabilityZone: 'ap-southeast-1a',
		CidrBlock: '10.88.1.0/24',
		MapPublicIpOnLaunch: true,
		VpcId: vpc.getVpcId(get),
	}));

	let subnetPrivate = createSubnet('private', get => ({
		AvailabilityZone: 'ap-southeast-1a',
		CidrBlock: '10.88.2.0/24',
		MapPublicIpOnLaunch: false,
		VpcId: vpc.getVpcId(get),
	}));

	let securityGroup = createSecurityGroup('app', get => ({
		Description: '-',
		GroupName: 'app',
		VpcId: vpc.getVpcId(get),
	}));

	let instance = createInstance('0', get => ({
		ImageId: 'ami-05d6d0aae066c8d93', // aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id | jq -r .Parameter.Value
		InstanceType: 't3.nano',
		SecurityGroups: [{ GroupId: securityGroup.getSecurityGroupId(get) }],
		SubnetId: subnetPrivate.getSubnetId(get),
	}));
});
