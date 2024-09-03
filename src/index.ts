import { createBucket } from './bucket';
import { prefix } from './constants';
import { createInstance } from './instance';
import { createInstanceProfile } from './instanceProfile';
import { createListener } from './Listener';
import { createLoadBalancer } from './LoadBalancer';
import { createPolicy } from './policy';
import { createRole } from './role';
import { createSecurityGroup } from './securityGroup';
import { createSecurityGroupRuleIngress } from './securityGroupRule';
import { createSubnet } from './subnet';
import { createTarget } from './Target';
import { createTargetGroup } from './TargetGroup';
import { createVpc } from './vpc';
import { run } from './warrior';

run(() => {
	let policy = createPolicy('policy-app', get => ({
		PolicyDocument: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: ['s3:ListBucket*', 's3:PutBucket*', 's3:GetBucket*'],
					Effect: 'Allow',
					Resource: ['arn:aws:s3:::app-bucket'],
				}
			],
		},
		PolicyName: `${prefix}-policy-app`,
	}));

	let role = createRole('role-app', get => ({
		AssumeRolePolicyDocument: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: ['sts:AssumeRole'],
					Effect: 'Allow',
					Principal: { AWS: 'arn:aws:iam::805876202485:user/ywsing' },
				}
			]
		},
		Policies: [policy.getPolicyName(get)],
		RoleName: `${prefix}-role-app`,
	}));

	let instanceProfile = createInstanceProfile('instance-profile-app', get => ({
		InstanceProfileName: `${prefix}-instance-profile-app`,
		Roles: [{ RoleName: role.getRoleName(get) }],
	}));

	let bucket = createBucket('bucket', get => ({
		Name: 'npt-chat',
	}));

	let vpc = createVpc('vpc', get => ({
		CidrBlockAssociationSet: [{ CidrBlock: '10.88.0.0/16' }],
		EnableDnsHostnames: true,
		EnableDnsSupport: true,
	}));

	let subnetPublic = createSubnet('subnet-public', get => ({
		AvailabilityZone: 'ap-southeast-1a',
		CidrBlock: '10.88.1.0/24',
		MapPublicIpOnLaunch: true,
		VpcId: vpc.getVpcId(get),
	}));

	let subnetPrivate = createSubnet('subnet-private', get => ({
		AvailabilityZone: 'ap-southeast-1a',
		CidrBlock: '10.88.2.0/24',
		MapPublicIpOnLaunch: false,
		VpcId: vpc.getVpcId(get),
	}));

	let securityGroup = createSecurityGroup('sg-app', get => ({
		Description: '-',
		GroupName: `${prefix}-sg-app`,
		VpcId: vpc.getVpcId(get),
	}));

	let securityGroupRule = createSecurityGroupRuleIngress('sg-app-rule-ingress-80', get => ({
		CidrIpv4: '10.88.0.0/16',
		FromPort: 80,
		GroupId: securityGroup.getSecurityGroupId(get),
		IpProtocol: 'TCP',
		// SourceGroup: securityGroup.getSecurityGroupId(get),
		ToPort: 80,
	}));

	let instance = createInstance('instance-0', get => ({
		IamInstanceProfile: { Arn: instanceProfile.getArn(get) },
		ImageId: 'ami-05d6d0aae066c8d93', // aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id | jq -r .Parameter.Value
		InstanceType: 't3.nano',
		SecurityGroups: [{ GroupId: securityGroup.getSecurityGroupId(get) }],
		SubnetId: subnetPrivate.getSubnetId(get),
	}));

	let loadBalancer = createLoadBalancer('alb', get => ({
		AvailabilityZone: [{ SubnetId: subnetPublic.getSubnetId(get) }],
		Name: 'alb',
		SecurityGroups: [securityGroup.getSecurityGroupId(get)],
	}));

	let targetGroup = createTargetGroup('tg', get => ({
		Name: `${prefix}-tg`,
		Protocol: 'HTTP',
		Port: 80,
		TargetType: 'instance',
		VpcId: vpc.getVpcId(get),
	}));

	let listener = createListener('listener', get => ({
		DefaultActions: [{ TargetGroupArn: targetGroup.getArn(get), Type: 'forward' }],
		LoadBalancerArn: loadBalancer.getArn(get),
		Port: 80,
		Protocol: 'HTTP',
	}));

	let target = createTarget('target', get => ({
		Target: { Id: instance.getInstanceId(get) },
		TargetGroupArn: targetGroup.getArn(get),
	}));

	// s3
	// ACM certificate
	// HTTPS
	// domain name
	// cloudfront
	// RDS
	// ...
});
