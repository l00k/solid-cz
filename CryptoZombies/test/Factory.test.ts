import { NewZombieEvent, Factory } from '@/Factory';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, findEvent } from './helpers/utils';


const zombieNames = [
    'Zombie #1',
    'Zombie #2'
];


const contractsToTest = [
    'Factory',
    'CryptoZombies',
];

contractsToTest.forEach(contractToTest => {

    describe(`${contractToTest} is Factory`, async() => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Factory;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            
            const contractFactory = await ethers.getContractFactory(contractToTest, owner);
            contract = <any>await contractFactory.deploy();
            await contract.deployed();
        });
        
        it('Should be able to create a new zombie', async() => {
            const tx = await contract
                .connect(alice)
                .createRandomZombie(zombieNames[0]);
            const result = await tx.wait();
            
            expect(result.status).to.equal(1);
            
            const newZombieEvent = findEvent<NewZombieEvent>(result, 'NewZombie');
            expect(newZombieEvent).to.containSubset({
                event: 'NewZombie',
                args: { 1: zombieNames[0] }
            });
            
            // expect to properly stored
            const zombie = await contract.zombies(newZombieEvent.args.zombieId);
            expect(zombie).to.not.be.undefined;
            expect(zombie.name).to.be.equal(zombieNames[0]);
            
            // expect proper ownership
            const owner = await contract.ownerOf(newZombieEvent.args.zombieId);
            expect(owner).to.equal(alice.address);
        });
        
        it('Should not allow to create second zombies', async() => {
            {
                const tx = await contract
                    .connect(alice)
                    .createRandomZombie(zombieNames[0]);
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
    
            {
                const createRandomZombieTx = contract
                    .connect(alice)
                    .createRandomZombie(zombieNames[0]);
                await assertErrorMessage(
                    createRandomZombieTx,
                    'ZombieCreationRestricted()'
                );
            }
        });
        
        it('Should return proper list of zombies', async() => {
            {
                const tx = await contract
                    .connect(alice)
                    .createRandomZombie(zombieNames[0]);
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
            
            {
                const tx = await contract
                    .connect(bob)
                    .createRandomZombie(zombieNames[0]);
                const result = await tx.wait();
                expect(result.status).to.equal(1);
            }
    
            const zombies = await contract.getZombiesByOwner(alice.address);
            expect(zombies.length).to.equal(1);
        });
    });

});
