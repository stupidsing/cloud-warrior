import { createDistribution } from './aws/cloudfront/distribution';
import { createUserPool } from './aws/cognito-idp/userPool';
import { createUserPoolClient } from './aws/cognito-idp/userPoolClient';
import { createInstance } from './aws/ec2/instance';
import { createInternetGateway } from './aws/ec2/internetGateway';
import { createInternetGatewayAttachment } from './aws/ec2/internetGatewayAttachment';
import { createListener } from './aws/ec2/listener';
import { createNatGateway } from './aws/ec2/natGateway';
import { createRoutes } from './aws/ec2/routes';
import { createRouteTable } from './aws/ec2/routeTable';
import { createRouteTableAssociations } from './aws/ec2/routeTableAssociations';
import { createSecurityGroup } from './aws/ec2/securityGroup';
import { createSecurityGroupRuleIngress } from './aws/ec2/securityGroupRule';
import { createSubnet } from './aws/ec2/subnet';
import { createVpc } from './aws/ec2/vpc';
import { createLifecyclePolicy } from './aws/ecr/lifecyclePolicy';
import { createRepository } from './aws/ecr/repository';
import { createCacheCluster } from './aws/elasticache/cacheCluster';
import { createReplicationGroup } from './aws/elasticache/replicationGroup';
import { createLoadBalancer } from './aws/elbv2/loadBalancer';
import { createTarget } from './aws/elbv2/target';
import { createTargetGroup } from './aws/elbv2/targetGroup';
import { createInstanceProfile } from './aws/iam/instanceProfile';
import { createPolicy } from './aws/iam/policy';
import { createRole } from './aws/iam/role';
import { createEventSourceMapping } from './aws/lambda/eventSourceMapping';
import { createFunction } from './aws/lambda/function';
import { createDbCluster } from './aws/rds/dbCluster';
import { createDbInstance } from './aws/rds/dbInstance';
import { createDbSubnetGroup } from './aws/rds/dbSubnetGroup';
import { createHostedZone } from './aws/route53/hostedZone';
import { createRecord } from './aws/route53/record';
import { createBucket } from './aws/s3/bucket';
import { createQueue } from './aws/sqs/Queue';
import { createIpSet } from './aws/wafv2/ipSet';
import { createWebAcl } from './aws/wafv2/webAcl';
import { prefix } from './constants';
import { run } from './warrior';

run(process.env.ACTION ?? 'up', () => {
	let allocationIds = ['eipalloc-090b790ec9c32c45f', 'eipalloc-0fb97b6a07242da71'];

	let userPool = createUserPool('user-pool', get => ({
		Name: 'user-pool',
	}));

	let userPoolClient = createUserPoolClient('user-pool-client', get => ({
		ClientName: 'user-pool-client',
		UserPoolId: userPool.getId(get),
	}));

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
				},
				{
					Action: ['sts:AssumeRole'],
					Effect: 'Allow',
					Principal: { Service: 'lambda.amazonaws.com' },
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

	let repository = createRepository('repository', get => ({
		repositoryName: 'repository',
	}));

	let lifecyclePolicy = createLifecyclePolicy('lifecycle-policy', get => ({
		lifecyclePolicyText: JSON.stringify({
			rules: [{
				action: { type: 'expire' },
				description: 'Expire images older than 14 days',
				rulePriority: 1,
				selection: {
					countNumber: 14,
					countType: 'sinceImagePushed',
					countUnit: 'days',
					tagStatus: 'untagged',
				},
			}],
		}),
		repositoryName: repository.getRepositoryName(get),
	}));

	let bucket = createBucket('bucket', get => ({
		Name: 'npt-chat',
		Region: 'ap-southeast-1',
	}));

	let vpc = createVpc('vpc', get => ({
		CidrBlockAssociationSet: [{ CidrBlock: '10.88.0.0/16' }],
		EnableDnsHostnames: true,
		EnableDnsSupport: true,
	}));

	let publicSubnets = [
		{ AvailabilityZone: 'ap-southeast-1a', CidrBlock: '10.88.11.0/24' },
		{ AvailabilityZone: 'ap-southeast-1b', CidrBlock: '10.88.12.0/24' },
		{ AvailabilityZone: 'ap-southeast-1c', CidrBlock: '10.88.13.0/24' },
	].map(({ AvailabilityZone, CidrBlock }, i) => createSubnet(`subnet-public-${i}`, get => ({
		AvailabilityZone,
		CidrBlock,
		MapPublicIpOnLaunch: true,
		VpcId: vpc.getVpcId(get),
	})));

	let privateSubnets = [
		{ AvailabilityZone: 'ap-southeast-1a', CidrBlock: '10.88.21.0/24' },
		{ AvailabilityZone: 'ap-southeast-1b', CidrBlock: '10.88.22.0/24' },
		{ AvailabilityZone: 'ap-southeast-1c', CidrBlock: '10.88.23.0/24' },
	].map(({ AvailabilityZone, CidrBlock }, i) => createSubnet(`subnet-private-${i}`, get => ({
		AvailabilityZone,
		CidrBlock,
		MapPublicIpOnLaunch: false,
		VpcId: vpc.getVpcId(get),
	})));

	let internetGateway = createInternetGateway('igw', get => ({
	}));

	let internetGatewayAttachment = createInternetGatewayAttachment('igw-a', get => ({
		Attachments: [{ VpcId: vpc.getVpcId(get) }],
		InternetGatewayId: internetGateway.getInternetGatewayId(get),
	}));

	let routeTable = createRouteTable('rt', get => ({
		VpcId: vpc.getVpcId(get),
	}));

	let route = createRoutes('route', get => ({
		Routes: [
			{ DestinationCidrBlock: '0.0.0.0/0', GatewayId: internetGateway.getInternetGatewayId(get) },
		],
		RouteTableId: routeTable.getRouteTableId(get),
	}));

	let routeTableAssociations = publicSubnets.map((subnet, i) => createRouteTableAssociations(`rta-${i}`, get => ({
		Associations: [{ SubnetId: subnet.getSubnetId(get) }],
		RouteTableId: routeTable.getRouteTableId(get),
	})));

	let natGateways = privateSubnets.map((subnet, i) => createNatGateway(`ngw-${i}`, get => ({
		NatGatewayAddresses: [{ AllocationId: allocationIds[i] }],
		SubnetId: subnet.getSubnetId(get),
	})));

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
		SubnetId: privateSubnets[0].getSubnetId(get),
	}));

	let cacheCluster = createCacheCluster('cache-cluster', get => ({
		CacheClusterId: 'cache-cluster',
		CacheNodeType: 'cache.t3.micro',
		Engine: 'redis',
		NumCacheNodes: 1,
	}));

	let replicationGroup = createReplicationGroup('replication-group', get => ({
		AutomaticFailover: true,
		CacheNodeType: 'cache.t3.micro',
		Description: '-',
		ReplicationGroupId: 'replication-group',
		Engine: 'redis',
		EngineVersion: '6.2',
		NodeGroups: [{ NodeGroupMembers: [{}, {}] }], // numNodeGroups = 1, replicasPerNodeGroup = 1
		PreferredMaintenanceWindow: 'sun:09:00-sun:19:00',
		SnapshotWindow: '20:00-21:00',
	}));

	let dbSubnetGroup = createDbSubnetGroup('db-subnet-group', get => ({
		DBSubnetGroupDescription: '-',
		DBSubnetGroupName: 'db-subnet-group',
		Subnets: privateSubnets.map(subnet => ({ SubnetIdentifier: subnet.getSubnetId(get) })),
	}));

	let dbCluster = createDbCluster('db-cluster', get => ({
		DBClusterIdentifier: 'db-cluster',
		DBSubnetGroup: dbSubnetGroup.getDBSubnetGroupName(get),
		Engine: 'aurora-postgresql',
		MasterUserPassword: '3cbf9540-749b-11ef-ad60-576b8c81f945',
		MasterUsername: 'postgres',
	}));

	let dbInstance = createDbInstance('db-instance', get => ({
		DBClusterIdentifier: dbCluster.getDBClusterIdentifier(get),
		DBInstanceClass: 'db.t3.medium',
		DBInstanceIdentifier: 'db-instance',
		Engine: 'aurora-postgresql',
	}));

	let queue = createQueue('queue', get => ({
		QueueName: 'queue',
	}));

	let function_ = createFunction('function', get => ({
		Code: { ImageUri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/hello-world:latest' },
		FunctionName: 'function',
		PackageType: 'Image',
		Role: role.getArn(get),
	}));

	let eventSourceMapping = createEventSourceMapping('event-source-mapping', get => ({
		FunctionName: function_.getFunctionName(get),
	}));

	let loadBalancer = createLoadBalancer('alb', get => ({
		AvailabilityZones: publicSubnets.map(subnet => ({ SubnetId: subnet.getSubnetId(get) })),
		Name: 'alb',
		SecurityGroups: [securityGroup.getSecurityGroupId(get)],
	}));

	let targetGroup = createTargetGroup('tg', get => ({
		Dummy: internetGatewayAttachment.getInternetGatewayId(get), // dependency
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

	let ipSet = createIpSet('ipset', get => ({
		Addresses: ['192.168.101.202/32'],
		IPAddressVersion: 'IPV4',
		Name: 'ipset',
		Region: 'us-east-1',
		Scope: 'CLOUDFRONT',
	}));

	let webAcl = createWebAcl('webacl', get => ({
		DefaultAction: {
			Allow: { CustomRequestHandling: { InsertHeaders: [{ Name: 'x-header', Value: 'npt' }] } },
		},
		Name: 'webacl',
		Region: 'us-east-1',
		Scope: 'CLOUDFRONT',
		VisibilityConfig: {
			CloudWatchMetricsEnabled: false,
			MetricName: 'metric',
			SampledRequestsEnabled: false,
		},
	}));

	let hostedZone = createHostedZone('zone', get => ({
		Name: 'npt.com',
		CallerReference: '862c3944-6b5a-11ef-8195-7f23c933da52',
	}));

	let record = createRecord('record', get => ({
		HostedZoneId: hostedZone.getId(get),
		Name: 'rec.npt.com.',
		ResourceRecords: [{ Value: '"abcdef"' }],
		TTL: 300,
		Type: 'TXT',
	}));

	// ACM certificate validation
	// RDS
	// WAFv2
	// ...
});
