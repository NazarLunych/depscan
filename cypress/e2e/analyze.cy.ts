describe('analyze golden path', () => {
  it('streams a package card and progress after submitting a package.json', () => {
    cy.intercept('POST', '/api/analyze', { fixture: 'analyze-stream.sse' }).as('analyze')

    cy.visit('/')

    cy.get('textarea').type(JSON.stringify({ dependencies: { react: '^17.0.2' } }), {
      parseSpecialCharSequences: false,
    })
    cy.contains('button', 'Analyze').click()

    cy.wait('@analyze')

    cy.contains('react').should('be.visible')
    cy.contains('Upgrade required').should('be.visible')
    cy.contains('1 / 1').should('be.visible')
    cy.contains('100%').should('be.visible')
  })

  it('rejects a package.json with no dependencies before sending a request', () => {
    let requestSent = false

    cy.intercept('POST', '/api/analyze', () => {
      requestSent = true
    }).as('analyze')

    cy.visit('/')

    cy.get('textarea').type(JSON.stringify({}), { parseSpecialCharSequences: false })
    cy.contains('button', 'Analyze').click()

    cy.contains('No dependencies found in this package.json').should('be.visible')
    cy.then(() => {
      expect(requestSent).to.eq(false)
    })
  })
})
